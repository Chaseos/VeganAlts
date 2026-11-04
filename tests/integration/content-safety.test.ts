import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import { catalogFixture } from "./fixtures";
import {
  ModerationDecisionService,
  ProviderError,
} from "../../server/moderation/application/decision-service";
import { D1DecisionRepository } from "../../server/moderation/infrastructure/d1-decision-repository";
import { D1ModerationWorkRepository } from "../../server/moderation/infrastructure/d1-work-repository";
import { FakeDecisionProvider } from "../../server/moderation/infrastructure/fake-provider";
import { FakeSafetyProvider } from "../../server/moderation/infrastructure/fake-safety-provider";
import { moderationPolicy } from "../../server/moderation/domain/policy";
import { ModerationWorkService } from "../../server/moderation/application/work-service";
import { retryModeration } from "../../server/moderation/infrastructure/retry";
import { commentServices } from "../../server/comments/infrastructure/composition";
import { communityServices } from "../../server/community/infrastructure/composition";
import { profilesService } from "../../server/auth/infrastructure/auth";
import { taxonomyServices } from "../../server/taxonomy/infrastructure/composition";
import {
  submissionInput,
  changeInput,
} from "../../server/community/domain/contracts";
import type { ContentSafetyProvider } from "../../server/moderation/domain/safety";
import { taxonomySeedStatements } from "../../db/seed/taxonomy";

const id = () => crypto.randomUUID();
const testEnv = (extra: object = {}) =>
  ({
    ...env,
    APP_ENV: "local",
    MODERATION_PROVIDER: "fake",
    CONTENT_SAFETY_PROVIDER: "fake",
    RANKING_PRIOR_MEAN: "3.5",
    RANKING_PRIOR_STRENGTH: "10",
    ...extra,
  }) as unknown as Cloudflare.Env;
afterEach(() => vi.restoreAllMocks());
function decisions(
  safety: ContentSafetyProvider,
  provider = new FakeDecisionProvider(),
  clock = Date.now,
  policy = {},
) {
  return new ModerationDecisionService(
    new D1DecisionRepository(env.DB),
    provider,
    moderationPolicy(JSON.stringify(policy)),
    id,
    clock,
    safety,
  );
}
it("safety rejection stops Clef, persists an authoritative BLOCKED and leaves ordinary negative opinions eligible", async () => {
  const f = await catalogFixture(env.DB),
    safe = new FakeSafetyProvider(),
    clef = new FakeDecisionProvider(),
    call = vi.spyOn(clef, "decide");
  const service = decisions(safe, clef);
  const input = {
    kind: "comment" as const,
    subject: { type: "comment" as const, id: id() },
    userId: f.users[0]!.id,
    state: { comment: { body: "[safety:blocked]" } },
    safety: { text: "[safety:blocked]" },
  };
  expect(await service.evaluate(input)).toMatchObject({ outcome: "BLOCKED" });
  expect(call).not.toHaveBeenCalled();
  expect(await service.latest("comment", input.subject.id)).toMatchObject({
    outcome: "BLOCKED",
  });
  expect(
    await service.evaluate({
      ...input,
      subject: { type: "comment", id: id() },
      state: {
        comment: { body: "This tastes awful and nothing like cheese." },
      },
      safety: { text: "This tastes awful and nothing like cheese." },
    }),
  ).toMatchObject({ outcome: "READY" });
  expect(call).toHaveBeenCalledOnce();
});
it("reuses passed safety across a transient Clef failure without sending it again", async () => {
  const f = await catalogFixture(env.DB),
    safe = new FakeSafetyProvider(),
    safetyCall = vi.spyOn(safe, "moderate"),
    clef = new FakeDecisionProvider();
  const decide = vi.spyOn(clef, "decide");
  decide.mockRejectedValueOnce(new ProviderError("provider_error"));
  const service = decisions(safe, clef);
  const input = {
    kind: "comment" as const,
    subject: { type: "comment" as const, id: id() },
    userId: f.users[0]!.id,
    state: { comment: { body: `Good burger ${id()}` } },
    safety: { text: `Fresh opinion ${id()}` },
  };
  expect(await service.evaluate(input)).toMatchObject({ status: "failed" });
  expect(await service.evaluate(input)).toMatchObject({
    status: "completed",
    outcome: "READY",
  });
  expect(safetyCall).toHaveBeenCalledOnce();
  expect(decide).toHaveBeenCalledTimes(2);
  const stored = await service.latest("comment", input.subject.id);
  expect(JSON.parse(stored!.result_data!).safety.reused).toBe(true);
  expect(stored!.result_data).not.toContain(input.safety.text);
});
it("checks profile names, comments and all proposal text without modifying existing public content on rejection", async () => {
  const f = await catalogFixture(env.DB),
    actor = { ...f.users[0]!, administrator: false },
    services = communityServices(testEnv());
  const profile = await profilesService(testEnv()).ensureProfile(actor.id);
  await expect(
    profilesService(testEnv()).update(actor.id, {
      handle: "fresh_handle",
      displayName: "[safety:blocked]",
    }),
  ).rejects.toMatchObject({ code: "PROFILE_NAME_BLOCKED" });
  expect(await profilesService(testEnv()).ensureProfile(actor.id)).toEqual(
    profile,
  );
  const comments = commentServices(testEnv());
  const saved = await comments.create(actor, id(), {
    productId: f.productId,
    body: "Ordinary product opinion.",
  });
  await expect(
    comments.edit(actor, saved.id, {
      body: "[safety:blocked]",
      expectedUpdatedAt: saved.updatedAt,
    }),
  ).rejects.toMatchObject({ code: "COMMENT_BLOCKED" });
  expect(
    await env.DB.prepare("SELECT body FROM comments WHERE id=?")
      .bind(saved.id)
      .first("body"),
  ).toBe(saved.body);
  const snapshot = await services.repository.snapshot(f.productId);
  await expect(
    services.contributions.propose(
      actor,
      id(),
      changeInput.parse({
        kind: "alias",
        productId: f.productId,
        expectedRevision: snapshot.revision,
        alias: "[safety:blocked]",
        evidence: {
          note: "Package text confirms this alias.",
          urls: [],
          imageIds: [],
        },
      }),
    ),
  ).rejects.toMatchObject({ code: "PROPOSAL_BLOCKED" });
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  await expect(
    services.contributions.proposeRetailer(actor, id(), {
      name: "[safety:blocked]",
      aliases: [],
      country: "US",
      websiteUrl: "https://example.com",
      note: "A store with products in this market.",
    }),
  ).rejects.toMatchObject({ code: "RETAILER_BLOCKED" });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM edit_proposals WHERE submitted_by=?",
    )
      .bind(actor.id)
      .first("n"),
  ).toBe(0);
  const report = await services.contributions.report(actor, id(), {
    targetType: "product",
    targetId: f.productId,
    reason: "other",
    note: "[safety:blocked] quoted in a private report",
    evidenceUrls: [],
  });
  expect(report.id).toBeTruthy();
});
it("keeps failed checks outside public comments and the manual inbox, then retries successfully", async () => {
  const f = await catalogFixture(env.DB),
    actor = { ...f.users[0]!, administrator: false },
    clock = { now: Date.now() };
  const input = { productId: f.productId, body: `A useful opinion ${id()}` },
    key = id();
  const initialEnv = testEnv();
  const beforeInbox = await communityServices(initialEnv).moderation.inbox(
    { ...actor, administrator: true },
    null,
  );
  vi.spyOn(FakeSafetyProvider.prototype, "moderate").mockRejectedValueOnce(
    new ProviderError("provider_error"),
  );
  const comments = commentServices(initialEnv, id, () => clock.now);
  await expect(comments.create(actor, key, input)).rejects.toMatchObject({
    code: "CHECKING_AUTOMATICALLY",
  });
  await expect(comments.create(actor, key, input)).rejects.toMatchObject({
    code: "CHECKING_AUTOMATICALLY",
  });
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE user_id=?")
      .bind(actor.id)
      .first("n"),
  ).toBe(0);
  const inbox = await communityServices(initialEnv).moderation.inbox(
    { ...actor, administrator: true },
    null,
  );
  expect(inbox.items.map((i) => i.id)).toEqual(
    beforeInbox.items.map((i) => i.id),
  );
  clock.now += 3_600_001;
  expect(await retryModeration(initialEnv, () => clock.now)).toBe(1);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM comments WHERE user_id=? AND moderation_state='visible'",
    )
      .bind(actor.id)
      .first("n"),
  ).toBe(1);
  expect(await comments.create(actor, key, input)).toMatchObject({
    body: input.body,
    state: "visible",
  });
  expect(await retryModeration(initialEnv, () => clock.now)).toBe(0);
});
it("exhausts three automatic retries, respects the original account's budget, and never creates jobs for quota denials", async () => {
  const f = await catalogFixture(env.DB),
    actor = { ...f.users[0]!, administrator: false },
    clock = { now: Date.now() },
    configured = testEnv();
  const input = { productId: f.productId, body: `Persistent outage ${id()}` };
  vi.spyOn(FakeSafetyProvider.prototype, "moderate").mockRejectedValue(
    new ProviderError("rate_limited", undefined, 3_600_000),
  );
  await expect(
    commentServices(configured, id, () => clock.now).create(actor, id(), input),
  ).rejects.toMatchObject({ code: "CHECKING_AUTOMATICALLY" });
  for (const elapsed of [3_600_001, 10_800_001, 21_600_001]) {
    const start = await env.DB.prepare(
      "SELECT created_at FROM moderation_jobs WHERE user_id=?",
    )
      .bind(actor.id)
      .first<number>("created_at");
    clock.now = start! + elapsed;
    await retryModeration(configured, () => clock.now);
  }
  expect(
    await env.DB.prepare(
      "SELECT status,attempts FROM moderation_jobs WHERE user_id=?",
    )
      .bind(actor.id)
      .first(),
  ).toMatchObject({ status: "retry_required", attempts: 3 });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_provider_attempts WHERE user_id=?",
    )
      .bind(actor.id)
      .first("n"),
  ).toBe(4);
  const other = { ...f.users[1]!, administrator: false };
  const limited = commentServices(
    testEnv({ MODERATION_POLICY: JSON.stringify({ accountDaily: 1 }) }),
    id,
    () => clock.now,
  );
  await expect(
    limited.create(other, id(), { ...input, body: `First outage ${id()}` }),
  ).rejects.toMatchObject({ code: "CHECKING_AUTOMATICALLY" });
  await expect(
    limited.create(other, id(), { ...input, body: `Second outage ${id()}` }),
  ).rejects.toMatchObject({ code: "MODERATION_ACCOUNT_LIMIT", status: 429 });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_jobs WHERE user_id=?",
    )
      .bind(other.id)
      .first("n"),
  ).toBe(1);
});
it("leases retry work once and refuses replaced or expired jobs", async () => {
  const f = await catalogFixture(env.DB),
    repository = new D1ModerationWorkRepository(env.DB),
    now = Date.now();
  await repository.enqueue({
    id: "job-test",
    user: f.users[0]!.id,
    operation: "comment_create",
    key: id(),
    hash: "hash",
    data: {},
    now,
    next: now,
  });
  const claimed = await Promise.all([
    repository.claim("job-test", "first", now),
    repository.claim("job-test", "second", now),
  ]);
  expect(claimed.filter(Boolean)).toHaveLength(1);
  const token = claimed[0] ? "first" : "second";
  const work = new ModerationWorkService(repository, id, () => now + 300_001, {
    id: "job-test",
    token,
  });
  await expect(work.assertCurrent()).rejects.toMatchObject({
    code: "CHECK_CHANGED",
  });
});
it("moderates standalone food suggestions and inline food text before canonical insertion", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const f = await catalogFixture(env.DB),
    actor = { ...f.users[0]!, administrator: false };
  const aisle = await env.DB.prepare(
    "SELECT id FROM categories WHERE slug='pork'",
  ).first<string>("id");
  const food = {
    name: `Brats ${id()} [safety:blocked]`,
    aisleId: aisle!,
    country: "GB",
    aliases: [],
    exampleProducts: [],
  };
  await expect(
    taxonomyServices(testEnv()).propose(actor, id(), food),
  ).rejects.toMatchObject({ code: "PROPOSAL_BLOCKED" });
  const services = communityServices(testEnv()),
    input = submissionInput.parse({
      name: `Patties ${id()}`,
      brand: `Garden ${id()}`,
      country: "GB",
      categoryIds: [],
      newFood: { name: food.name, aisleId: aisle! },
      imageSlots: ["front"],
    });
  const receipt = await services.submissions.preflight(actor, id(), input);
  await services.media.upload(actor, {
    receiptId: receipt.receiptId!,
    slot: "front",
    idempotencyKey: id(),
    bytes: Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0)),
  });
  expect(
    await services.submissions.finalize(actor, receipt.receiptId!, input),
  ).toMatchObject({ decision: "BLOCKED" });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM category_proposals WHERE submitted_by=?",
    )
      .bind(actor.id)
      .first("n"),
  ).toBe(0);
});
it("holds response revisions privately, preserves approved counts and rejects stale work after a newer response", async () => {
  const f = await catalogFixture(env.DB),
    actor = { ...f.users[0]!, administrator: false },
    responder = { ...f.users[1]!, administrator: false },
    clock = { now: Date.now() },
    configured = testEnv();
  const services = communityServices(configured, id, () => clock.now),
    snapshot = await services.repository.snapshot(f.productId);
  const proposal = await services.contributions.propose(
    actor,
    id(),
    changeInput.parse({
      kind: "rename",
      productId: f.productId,
      expectedRevision: snapshot.revision,
      name: "Updated product name",
      evidence: {
        note: "The new package shows the updated name.",
        urls: [],
        imageIds: [],
      },
    }),
  );
  await services.contributions.respond(responder, id(), proposal.id, {
    stance: "confirm",
  });
  const read = () =>
    env.DB.prepare(
      "SELECT confirm_count,disagree_count FROM edit_proposals WHERE id=?",
    )
      .bind(proposal.id)
      .first();
  expect(await read()).toMatchObject({ confirm_count: 1, disagree_count: 0 });
  const limited = vi
    .spyOn(FakeSafetyProvider.prototype, "moderate")
    .mockRejectedValueOnce(new ProviderError("provider_error"));
  const key = id();
  clock.now++;
  await expect(
    services.contributions.respond(responder, key, proposal.id, {
      stance: "disagree",
      note: "The packaging still shows the original name.",
    }),
  ).rejects.toMatchObject({ code: "CHECKING_AUTOMATICALLY" });
  expect(await read()).toMatchObject({ confirm_count: 1, disagree_count: 0 });
  expect(
    await env.DB.prepare(
      "SELECT note FROM edit_proposal_responses WHERE proposal_id=? AND user_id=?",
    )
      .bind(proposal.id, responder.id)
      .first("note"),
  ).toBeNull();
  limited.mockRestore();
  clock.now++;
  await services.contributions.respond(responder, id(), proposal.id, {
    stance: "confirm",
    note: "I independently checked the current package name.",
  });
  expect(
    await env.DB.prepare(
      "SELECT status FROM moderation_jobs WHERE user_id=? AND idempotency_key=?",
    )
      .bind(responder.id, key)
      .first("status"),
  ).toBe("retry_required");
  clock.now += 3_600_001;
  await retryModeration(configured, () => clock.now);
  expect(await read()).toMatchObject({ confirm_count: 1, disagree_count: 0 });
});
it("checks the fourth attached evidence image even when Clef receives at most three", async () => {
  const f = await catalogFixture(env.DB),
    actor = { ...f.users[0]!, administrator: false },
    services = communityServices(testEnv());
  const receipt = await services.submissions.evidenceReceipt(
    actor,
    id(),
    f.productId,
  );
  const imageIds: string[] = [];
  for (const slot of ["front", "back", "ingredients", "nutrition"] as const) {
    const uploaded = await services.media.upload(actor, {
      receiptId: receipt.receiptId,
      slot,
      idempotencyKey: id(),
      bytes: Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) =>
        c.charCodeAt(0),
      ),
    });
    imageIds.push(uploaded.imageId);
  }
  const safety = vi
    .spyOn(FakeSafetyProvider.prototype, "moderate")
    .mockImplementation(async (input) => ({
      model: "fake-safety-v1",
      flagged: (input.images?.length ?? 0) === 4,
      categories: { sexual: true },
      scores: { sexual: 0.7 },
      appliedInputTypes: { sexual: ["image"] },
    }));
  const clef = vi.spyOn(FakeDecisionProvider.prototype, "decide"),
    snapshot = await services.repository.snapshot(f.productId);
  await expect(
    services.contributions.propose(
      actor,
      id(),
      changeInput.parse({
        kind: "rename",
        productId: f.productId,
        expectedRevision: snapshot.revision,
        name: "New label name",
        evidenceReceiptId: receipt.receiptId,
        evidence: {
          note: "These pictures show the full package.",
          urls: [],
          imageIds,
        },
      }),
    ),
  ).rejects.toMatchObject({ code: "PROPOSAL_BLOCKED" });
  expect(safety.mock.calls[0]![0].images).toHaveLength(4);
  expect(clef).not.toHaveBeenCalled();
  expect(
    await env.DB.prepare("SELECT state FROM submission_receipts WHERE id=?")
      .bind(receipt.receiptId)
      .first("state"),
  ).toBe("staging");
});
it("invalidates reuse after policy and content changes and applies a shared global concurrency cap", async () => {
  const f = await catalogFixture(env.DB, 3),
    safe = new FakeSafetyProvider(),
    call = vi.spyOn(safe, "moderate");
  const request = {
    kind: "comment" as const,
    subject: { type: "comment" as const, id: id() },
    userId: f.users[0]!.id,
    state: { comment: { body: `Policy ${id()}` } },
    safety: { text: `Policy ${id()}` },
  };
  const first = decisions(safe);
  await first.evaluate(request);
  await first.evaluate(request);
  expect(call).toHaveBeenCalledOnce();
  await new ModerationDecisionService(
    new D1DecisionRepository(env.DB),
    new FakeDecisionProvider(),
    moderationPolicy(),
    id,
    Date.now,
    safe,
    { timeoutMs: 12_000, reuseDays: 30 },
  ).evaluate(request);
  expect(call).toHaveBeenCalledTimes(2);
  await first.evaluate({ ...request, safety: { text: `Changed ${id()}` } });
  expect(call).toHaveBeenCalledTimes(3);
  let release!: () => void;
  const original = new FakeSafetyProvider().moderate.bind(
    new FakeSafetyProvider(),
  );
  call.mockImplementation(
    (input) =>
      new Promise((resolve) => {
        release = () => void original(input).then(resolve);
      }),
  );
  const strict = decisions(safe, new FakeDecisionProvider(), Date.now, {
    globalConcurrent: 1,
  });
  const pending = strict.evaluate({
    ...request,
    userId: f.users[1]!.id,
    safety: { text: `Delayed ${id()}` },
  });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  expect(
    await strict.evaluate({
      ...request,
      userId: f.users[2]!.id,
      safety: { text: `Concurrent ${id()}` },
    }),
  ).toMatchObject({ status: "over_budget" });
  release();
  expect(await pending).toMatchObject({ outcome: "READY" });
});
it("rejects IP/account admission and upload bursts before model calls, stored content or retry work", async () => {
  const { authenticatedFixture } = await import("./auth-fixture");
  const { commentsApi } = await import("../../server/comments/http/handlers");
  const { communityApi } = await import("../../server/community/http/handlers");
  const auth = await authenticatedFixture(),
    f = await catalogFixture(env.DB);
  const pass = { limit: vi.fn(async () => ({ success: true })) },
    deny = { limit: vi.fn(async () => ({ success: false })) };
  const configured = {
    ...auth.authEnv,
    CONTENT_SAFETY_PROVIDER: "fake" as const,
    MODERATION_PROVIDER: "fake" as const,
    AI_IP_RATE_LIMIT: pass,
    AI_ACCOUNT_RATE_LIMIT: deny,
  };
  const headers = new Headers(auth.headers);
  headers.set("Idempotency-Key", id());
  headers.set("CF-Connecting-IP", "192.0.2.44");
  const safety = vi.spyOn(FakeSafetyProvider.prototype, "moderate"),
    clef = vi.spyOn(FakeDecisionProvider.prototype, "decide");
  await expect(
    commentsApi(
      new Request(`${configured.APP_URL}/api/v1/comments`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          productId: f.productId,
          body: "This should never reach moderation.",
        }),
      }),
      "comments",
      configured,
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(pass.limit).toHaveBeenCalledWith({ key: "ip:192.0.2.44" });
  expect(deny.limit).toHaveBeenCalledWith({ key: `user:${auth.user.id}` });
  await expect(
    communityApi(
      new Request(`${configured.APP_URL}/api/v1/submissions/receipt/uploads`, {
        method: "POST",
        headers,
        body: "{}",
      }),
      "submissions/receipt/uploads",
      { ...configured, UPLOAD_RATE_LIMIT: deny },
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(safety).not.toHaveBeenCalled();
  expect(clef).not.toHaveBeenCalled();
  for (const table of ["moderation_jobs", "moderation_decisions", "comments"]) {
    expect(
      await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`)
        .bind(auth.user.id)
        .first("n"),
    ).toBe(0);
  }
});
it("does not resume jobs for suspended accounts and expires work after 24 hours without another provider call", async () => {
  const f = await catalogFixture(env.DB),
    actor = { ...f.users[0]!, administrator: false },
    clock = { now: Date.now() },
    configured = testEnv();
  const safety = vi
    .spyOn(FakeSafetyProvider.prototype, "moderate")
    .mockRejectedValueOnce(new ProviderError("provider_error"));
  await expect(
    commentServices(configured, id, () => clock.now).create(actor, id(), {
      productId: f.productId,
      body: `Private draft ${id()}`,
    }),
  ).rejects.toMatchObject({ code: "CHECKING_AUTOMATICALLY" });
  safety.mockClear();
  await env.DB.prepare(
    "UPDATE profiles SET account_state='restricted' WHERE user_id=?",
  )
    .bind(actor.id)
    .run();
  clock.now += 3_600_001;
  await retryModeration(configured, () => clock.now);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_provider_attempts WHERE user_id=?",
    )
      .bind(actor.id)
      .first("n"),
  ).toBe(1);
  expect(
    await env.DB.prepare("SELECT status FROM moderation_jobs WHERE user_id=?")
      .bind(actor.id)
      .first("status"),
  ).toBe("retry_required");
  const repository = new D1ModerationWorkRepository(env.DB),
    other = f.users[1]!.id;
  await repository.enqueue({
    id: id(),
    user: other,
    operation: "comment_create",
    key: id(),
    hash: "expired",
    data: { productId: f.productId, body: "Expired private draft" },
    now: clock.now,
    next: clock.now + 3_600_000,
  });
  clock.now += 86_400_001;
  await retryModeration(configured, () => clock.now);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_provider_attempts WHERE user_id IN (?,?)",
    )
      .bind(actor.id, other)
      .first("n"),
  ).toBe(1);
  expect(
    await env.DB.prepare(
      "SELECT status,attempts FROM moderation_jobs WHERE user_id=?",
    )
      .bind(other)
      .first(),
  ).toMatchObject({ status: "retry_required", attempts: 0 });
});
it("leases identical in-flight requests so changed context cannot cause duplicate provider calls", async () => {
  const f = await catalogFixture(env.DB),
    actor = { ...f.users[0]!, administrator: false },
    configured = testEnv(),
    comments = commentServices(configured),
    key = id();
  const input = { productId: f.productId, body: `One request ${id()}` };
  const moderate = FakeSafetyProvider.prototype.moderate,
    provider = new FakeSafetyProvider();
  let release!: () => void;
  const safety = vi
    .spyOn(FakeSafetyProvider.prototype, "moderate")
    .mockImplementationOnce(
      (value) =>
        new Promise((resolve) => {
          release = () => void moderate.call(provider, value).then(resolve);
        }),
    );
  const first = comments.create(actor, key, input);
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await expect(
    commentServices(configured).create(actor, key, input),
  ).rejects.toMatchObject({ code: "CHECK_IN_PROGRESS" });
  expect(safety).toHaveBeenCalledOnce();
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_jobs WHERE user_id=?",
    )
      .bind(actor.id)
      .first("n"),
  ).toBe(0);
  release();
  const saved = await first;
  expect(await comments.create(actor, key, input)).toEqual(saved);
  expect(safety).toHaveBeenCalledOnce();
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_request_leases WHERE user_id=?",
    )
      .bind(actor.id)
      .first("n"),
  ).toBe(0);
});
