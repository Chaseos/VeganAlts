import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { catalogFixture } from "./fixtures";
import {
  ModerationDecisionService,
  ProviderError,
  type ModerationProvider,
} from "../../server/moderation/application/decision-service";
import { D1DecisionRepository } from "../../server/moderation/infrastructure/d1-decision-repository";
import { FakeDecisionProvider } from "../../server/moderation/infrastructure/fake-provider";
import { moderationPolicy } from "../../server/moderation/domain/policy";
import { communityServices } from "../../server/community/infrastructure/composition";
import { submissionInput } from "../../server/community/domain/contracts";

const id = () => crypto.randomUUID();
const decisionRows = (subject: string) =>
  env.DB.prepare(
    "SELECT * FROM moderation_decisions WHERE subject_id=? ORDER BY created_at,id",
  )
    .bind(subject)
    .all<Record<string, unknown>>()
    .then((r) => r.results);

function service(
  provider: ModerationProvider,
  overrides: Record<string, number> = {},
  clock = { now: Date.now() },
) {
  return new ModerationDecisionService(
    new D1DecisionRepository(env.DB),
    provider,
    moderationPolicy(JSON.stringify(overrides)),
    id,
    () => clock.now,
  );
}
const comment = (userId: string, body: string, subject = id()) => ({
  kind: "comment" as const,
  subject: { type: "comment" as const, id: subject },
  userId,
  state: { product: { name: "Test burger" }, comment: { body } },
});

it("records structured answers only and reuses identical payloads without charging", async () => {
  const f = await catalogFixture(env.DB, 1);
  const provider = new FakeDecisionProvider(),
    decide = vi.spyOn(provider, "decide");
  const decisions = service(provider);
  const body = `A private opinion ${id()}`;
  const first = await decisions.evaluate(comment(f.users[0]!.id, body));
  expect(first).toMatchObject({ status: "completed", outcome: "READY" });
  const second = await decisions.evaluate(comment(f.users[0]!.id, body));
  expect(second).toMatchObject({ status: "reused", outcome: "READY" });
  expect(decide).toHaveBeenCalledTimes(1);
  const row = (id: string | null) =>
    env.DB.prepare(
      "SELECT status,charged,reused_from,result_data FROM moderation_decisions WHERE id=?",
    )
      .bind(id)
      .first<{
        status: string;
        charged: number;
        reused_from: string | null;
        result_data: string;
      }>();
  const stored = { results: [(await row(first.id))!, (await row(second.id))!] };
  expect(stored.results.map((r) => [r.status, r.charged])).toEqual([
    ["completed", 1],
    ["reused", 0],
  ]);
  expect(stored.results[1]!.reused_from).toBe(first.id);
  // Neither the prompt nor the contributor's text is retained.
  for (const r of stored.results) expect(r.result_data).not.toContain(body);
  expect(JSON.parse(stored.results[0]!.result_data).answers.relevance).toEqual(
    expect.objectContaining({ option: "RELEVANT" }),
  );
});

it("enforces environment, account and concurrency budgets before any provider call", async () => {
  const f = await catalogFixture(env.DB, 2);
  const provider = new FakeDecisionProvider(),
    decide = vi.spyOn(provider, "decide");
  const clock = { now: Date.UTC(2031, 0, 5, 12) };
  const account = service(provider, { accountDaily: 1 }, clock);
  await account.evaluate(comment(f.users[0]!.id, `first ${id()}`));
  const limited = await account.evaluate(
    comment(f.users[0]!.id, `second ${id()}`),
  );
  expect(limited).toMatchObject({
    status: "over_budget",
    outcome: "NEEDS_REVIEW",
  });
  expect(
    await account.evaluate(comment(f.users[1]!.id, `other ${id()}`)),
  ).toMatchObject({ status: "completed" });
  expect(decide).toHaveBeenCalledTimes(2);
  // The environment budget counts every account's charged evaluations.
  const environment = service(
    provider,
    { daily: 1 },
    {
      now: Date.UTC(2031, 0, 6, 12),
    },
  );
  await environment.evaluate(comment(f.users[0]!.id, `a ${id()}`));
  expect(
    await environment.evaluate(comment(f.users[1]!.id, `b ${id()}`)),
  ).toMatchObject({ status: "over_budget" });
  // Concurrent reservations are bounded per account.
  let release!: () => void;
  const slow: ModerationProvider = {
    name: "slow",
    model: () => "slow",
    decide: (request) =>
      new Promise((resolve) => {
        release = () => resolve(new FakeDecisionProvider().decide(request));
      }),
  };
  const concurrent = service(
    slow,
    { concurrent: 1 },
    {
      now: Date.UTC(2031, 0, 7, 12),
    },
  );
  const pending = concurrent.evaluate(comment(f.users[0]!.id, `c ${id()}`));
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  expect(
    await concurrent.evaluate(comment(f.users[0]!.id, `d ${id()}`)),
  ).toMatchObject({ status: "over_budget" });
  release();
  expect(await pending).toMatchObject({ status: "completed" });
});

it("degrades provider errors, timeouts and expired leases to review, never approval", async () => {
  const f = await catalogFixture(env.DB, 1);
  const failing: ModerationProvider = {
    name: "failing",
    model: () => "failing",
    decide: async () => {
      throw new ProviderError("rate_limited");
    },
  };
  const failed = await service(failing).evaluate(
    comment(f.users[0]!.id, `x ${id()}`),
  );
  expect(failed).toMatchObject({ status: "failed", outcome: "NEEDS_REVIEW" });
  expect(
    await env.DB.prepare(
      "SELECT error_code FROM moderation_decisions WHERE id=?",
    )
      .bind(failed.id)
      .first("error_code"),
  ).toBe("rate_limited");
  const hanging: ModerationProvider = {
    name: "hanging",
    model: () => "hanging",
    decide: () => new Promise(() => undefined),
  };
  expect(
    await service(hanging, { timeoutMs: 20 }).evaluate(
      comment(f.users[0]!.id, `y ${id()}`),
    ),
  ).toMatchObject({ status: "failed", outcome: "NEEDS_REVIEW" });
  // A reservation abandoned mid-call expires to review.
  const clock = { now: Date.now() };
  const abandoned = service(
    hanging,
    { timeoutMs: 1_000_000, leaseMs: 1000 },
    clock,
  );
  const subject = id();
  void abandoned.evaluate(comment(f.users[0]!.id, `z ${id()}`, subject));
  await vi.waitFor(async () =>
    expect(await decisionRows(subject)).toHaveLength(1),
  );
  clock.now += 2000;
  expect(await abandoned.expireLeases()).toBeGreaterThanOrEqual(1);
  expect((await decisionRows(subject))[0]).toMatchObject({
    status: "failed",
    outcome: "NEEDS_REVIEW",
    error_code: "lease_expired",
  });
  await expect(
    env.DB.prepare(
      "INSERT INTO moderation_decisions(id,subject_type,subject_id,kind,schema_version,policy_version,provider,model,input_hash,status,outcome,created_at) VALUES(?,?,?,?,1,1,'x','x','h','failed','READY',1)",
    )
      .bind(id(), "comment", id(), "comment")
      .run(),
  ).rejects.toThrow();
});

async function submissionSetup() {
  const f = await catalogFixture(env.DB, 2);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const services = communityServices(
    { ...env, APP_ENV: "local", MODERATION_PROVIDER: "fake" },
    id,
  );
  const actor = { ...f.users[0]!, administrator: false };
  const bytes = Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) =>
    c.charCodeAt(0),
  );
  async function attempt(note: string) {
    const input = submissionInput.parse({
      name: `Decision patties ${id().slice(0, 8)}`,
      brand: `Decision ${id()}`,
      country: "US",
      categoryIds: [f.categories[0]],
      imageSlots: ["front"],
      ingredientUrl: "https://example.com/ingredients",
      statusBasis: `Synthetic manufacturer ingredient evidence. ${note}`,
      noKnownAnimalIngredients: true,
      manufacturerLabel: "vegan",
    });
    const checked = await services.submissions.preflight(actor, id(), input);
    await services.media.upload(actor, {
      receiptId: checked.receiptId!,
      slot: "front",
      idempotencyKey: id(),
      bytes,
    });
    const receipt = await services.submissions.finalize(
      actor,
      checked.receiptId!,
      input,
    );
    const planned = await env.DB.prepare(
      "SELECT planned_product_id,state FROM submission_receipts WHERE id=?",
    )
      .bind(checked.receiptId)
      .first<{ planned_product_id: string; state: string }>();
    const product = await env.DB.prepare("SELECT id FROM products WHERE id=?")
      .bind(planned!.planned_product_id)
      .first();
    return {
      receipt,
      receiptId: checked.receiptId!,
      state: planned!.state,
      product,
      input,
    };
  }
  return { services, actor, attempt };
}

it("requires an automated READY before canonical insertion and keeps every other outcome non-canonical", async () => {
  const { services, actor, attempt } = await submissionSetup();
  const ready = await attempt("Clear evidence.");
  expect(ready.receipt).toMatchObject({ decision: "READY" });
  expect(ready.product).not.toBeNull();
  expect(await decisionRows(ready.receiptId)).toEqual([
    expect.objectContaining({ status: "completed", outcome: "READY" }),
  ]);

  const mismatch = await attempt("[fake:matches_claimed_product=NO]");
  expect(mismatch.receipt).toMatchObject({ decision: "NEEDS_CHANGES" });
  expect(
    "reasons" in mismatch.receipt && mismatch.receipt.reasons[0],
  ).toContain("do not appear to show");
  expect(mismatch.product).toBeNull();
  expect(mismatch.state).toBe("staging");

  const unavailable = await attempt("[fake:error]");
  expect(unavailable.receipt).toMatchObject({ decision: "NEEDS_REVIEW" });
  expect(unavailable.product).toBeNull();
  expect(unavailable.state).toBe("review");
  expect(
    await env.DB.prepare(
      "SELECT reasons FROM pending_submissions WHERE submission_id=?",
    )
      .bind(unavailable.receiptId)
      .first("reasons"),
  ).toContain("automated check was unavailable");
  // Operators see the advisory record; the contributor does not.
  const operator = { ...actor, administrator: true };
  expect(
    await services.moderation.detail(
      operator,
      "submission",
      unavailable.receiptId,
    ),
  ).toMatchObject({
    automated: { status: "failed", errorCode: "provider_error" },
  });
  expect(
    await services.moderation.detail(
      actor,
      "submission",
      unavailable.receiptId,
    ),
  ).toMatchObject({ automated: null });

  const blocked = await attempt("[fake:safety=UNSAFE]");
  expect(blocked.receipt).toMatchObject({ decision: "BLOCKED" });
  expect(blocked.product).toBeNull();
  expect(blocked.state).toBe("rejected");
  expect(
    await services.submissions.finalize(
      actor,
      blocked.receiptId,
      blocked.input,
    ),
  ).toMatchObject({ decision: "BLOCKED" });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM pending_submissions WHERE submission_id IN (?,?)",
    )
      .bind(mismatch.receiptId, blocked.receiptId)
      .first("n"),
  ).toBe(0);
});
