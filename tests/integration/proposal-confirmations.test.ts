import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { catalogFixture } from "./fixtures";
import { communityServices } from "../../server/community/infrastructure/composition";
import { invalidateCommunityProduct } from "../../server/community/infrastructure/invalidation";
import type { MaterialCatalogChange } from "../../server/shared/http/public-cache";
import { changeInput } from "../../server/community/domain/contracts";
import { SYSTEM_ACTOR_ID } from "../../server/community/domain/policy";

const purged = vi.hoisted(() => [] as MaterialCatalogChange[][]);
vi.mock("../../server/catalog/infrastructure/invalidation", () => ({
  scheduleCatalogInvalidation: (changes: MaterialCatalogChange[]) =>
    purged.push(changes),
}));

const id = () => crypto.randomUUID();
const evidence = {
  urls: ["https://brand.example/product"],
  imageIds: [],
  note: "The current package and manufacturer page show this fact.",
};
async function fixture(overrides: Record<string, string> = {}) {
  const f = await catalogFixture(env.DB, 5);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const clock = { now: Date.now() };
  const services = communityServices(
    {
      ...env,
      APP_ENV: "local",
      MODERATION_PROVIDER: "fake",
      PROPOSAL_AUTO_APPLY: '{"minAgeHours":0}',
      ...overrides,
    },
    id,
    () => clock.now,
  );
  const [proposer, confirmer, second, third] = f.users.map((u) => ({
    ...u,
    administrator: false,
  }));
  const admin = { ...f.users[4]!, administrator: true };
  const propose = async (
    fields: Record<string, unknown>,
    note = evidence.note,
  ) =>
    services.contributions.propose(
      proposer!,
      id(),
      changeInput.parse({
        productId: f.productId,
        expectedRevision: (await services.repository.snapshot(f.productId))
          .revision,
        evidence: { ...evidence, note },
        ...fields,
      }),
    );
  return {
    f,
    clock,
    services,
    proposer: proposer!,
    confirmer: confirmer!,
    second: second!,
    third: third!,
    admin,
    propose,
  };
}

it("records one current stance per contributor, excludes the proposer and fences stale decisions", async () => {
  const { services, proposer, confirmer, second, admin, propose } =
    await fixture();
  const proposal = await propose({ kind: "rename", name: "Garden Crumbles" });
  await expect(
    services.contributions.respond(proposer, id(), proposal.id, {
      stance: "confirm",
    }),
  ).rejects.toMatchObject({ code: "PROPOSAL_CLOSED" });
  const before = (await services.repository.proposal(proposal.id))!;
  await services.contributions.respond(confirmer, id(), proposal.id, {
    stance: "confirm",
  });
  // A changed stance replaces the earlier one; counts never double.
  await services.contributions.respond(confirmer, id(), proposal.id, {
    stance: "disagree",
    note: "The package I bought still uses the old name.",
  });
  await services.contributions.respond(second, id(), proposal.id, {
    stance: "confirm",
  });
  const after = (await services.repository.proposal(proposal.id))!;
  expect(after).toMatchObject({ confirm_count: 1, disagree_count: 1 });
  expect(after.updated_at).toBeGreaterThan(before.updated_at);
  // A decision drafted before the new responses is stale.
  await expect(
    services.moderation.decide(admin, id(), "proposal", proposal.id, {
      decision: "accept",
      expectedRevision: before.updated_at,
      note: "Reviewed before the latest community responses.",
      effect: "none",
    }),
  ).rejects.toMatchObject({ code: "STALE_DECISION" });
  // Restricted accounts stop counting.
  await env.DB.prepare(
    "UPDATE profiles SET account_state='restricted' WHERE user_id=?",
  )
    .bind(second.id)
    .run();
  await services.contributions.respond(confirmer, id(), proposal.id, {
    stance: "evidence",
    note: "Store photo attached at the linked source.",
    urls: ["https://store.example/photo"],
  });
  expect(await services.repository.proposal(proposal.id)).toMatchObject({
    confirm_count: 0,
    disagree_count: 0,
    evidence_count: 1,
  });
  expect(
    (await services.moderation.inbox(admin, null, "confirmation")).items.map(
      (i) => i.id,
    ),
  ).toContain(proposal.id);
});

it("automatically applies a confirmed tier 2 change as the audited system actor, reversibly", async () => {
  const { f, services, confirmer, admin, propose } = await fixture();
  const proposal = await propose({ kind: "rename", name: "Garden Crumbles" });
  expect(await services.moderation.autoAccept(proposal.id)).toMatchObject({
    applied: false,
    reason: "confirmations",
  });
  await services.contributions.respond(confirmer, id(), proposal.id, {
    stance: "confirm",
  });
  expect(await services.moderation.sweepProposals()).toHaveLength(1);
  const snapshot = await services.repository.snapshot(f.productId);
  expect(snapshot.name).toBe("Garden Crumbles");
  expect(await services.repository.proposal(proposal.id)).toMatchObject({
    status: "accepted",
    resolved_by: SYSTEM_ACTOR_ID,
  });
  const action = await env.DB.prepare(
    "SELECT id,actor_id,kind FROM moderation_actions WHERE target_id=?",
  )
    .bind(proposal.id)
    .first<{ id: string; actor_id: string; kind: string }>();
  expect(action).toMatchObject({
    actor_id: SYSTEM_ACTOR_ID,
    kind: "proposal_accept",
  });
  expect(
    await env.DB.prepare("SELECT actor_user_id FROM audit_log WHERE id=?")
      .bind(action!.id)
      .first("actor_user_id"),
  ).toBe(SYSTEM_ACTOR_ID);
  // The new name joins the product's identity; the old name still resolves.
  expect(
    (await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM product_identity_keys WHERE product_id=?",
    )
      .bind(f.productId)
      .first<number>("n"))!,
  ).toBeGreaterThanOrEqual(1);
  // Operators can reverse an automatic decision like any other.
  await services.moderation.reverse(admin, id(), action!.id, {
    expectedRevision: snapshot.revision,
    note: "Reversed while the manufacturer confirms the rename.",
  });
  expect((await services.repository.snapshot(f.productId)).name).toBe(
    "Test burger",
  );
});

it("keeps protected, disputed, unevaluated and established changes with operators", async () => {
  const { f, services, confirmer, second, third, propose } = await fixture();
  const classification = await propose({
    kind: "classification",
    veganStatus: "vegan",
    manufacturerLabel: "vegan",
  });
  for (const user of [confirmer, second, third])
    await services.contributions.respond(user, id(), classification.id, {
      stance: "confirm",
    });
  expect(await services.moderation.autoAccept(classification.id)).toMatchObject(
    { applied: false, reason: "protected" },
  );
  const disputed = await propose({ kind: "rename", name: "Disputed name" });
  await services.contributions.respond(confirmer, id(), disputed.id, {
    stance: "confirm",
  });
  await services.contributions.respond(second, id(), disputed.id, {
    stance: "disagree",
    note: "The package still shows the original name.",
  });
  expect(await services.moderation.autoAccept(disputed.id)).toMatchObject({
    applied: false,
    reason: "disagreement",
  });
  // A disabled provider never automates.
  const manual = communityServices(
    { ...env, APP_ENV: "local", PROPOSAL_AUTO_APPLY: '{"minAgeHours":0}' },
    id,
  );
  const unevaluated = await manual.contributions.propose(
    { ...f.users[0]!, administrator: false },
    id(),
    changeInput.parse({
      productId: f.productId,
      expectedRevision: (await manual.repository.snapshot(f.productId))
        .revision,
      evidence,
      kind: "alias",
      alias: "Manual alias",
    }),
  );
  await manual.contributions.respond(confirmer, id(), unevaluated.id, {
    stance: "confirm",
  });
  expect(await manual.moderation.autoAccept(unevaluated.id)).toMatchObject({
    applied: false,
    reason: "automated_check",
  });
  // Established products need more independent confirmations.
  const strict = communityServices(
    {
      ...env,
      APP_ENV: "local",
      MODERATION_PROVIDER: "fake",
      PROPOSAL_AUTO_APPLY: '{"minAgeHours":0,"established":1}',
    },
    id,
  );
  await env.DB.prepare(
    "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,4,1,1)",
  )
    .bind(id(), third.id, f.versionId, f.categories[0])
    .run();
  const rename = await propose({ kind: "rename", name: "Established name" });
  await strict.contributions.respond(confirmer, id(), rename.id, {
    stance: "confirm",
  });
  expect(await strict.moderation.autoAccept(rename.id)).toMatchObject({
    applied: false,
    reason: "confirmations",
  });
  // The default policy keeps tier 2 open for a day.
  const waiting = communityServices(
    { ...env, APP_ENV: "local", MODERATION_PROVIDER: "fake" },
    id,
  );
  expect(await waiting.moderation.autoAccept(disputed.id)).toMatchObject({
    applied: false,
  });
});

it("applies tier 1 additions immediately, rejects contradicted evidence and reverses category additions", async () => {
  const { f, services, confirmer, admin, propose } = await fixture();
  const alias = await propose({ kind: "alias", alias: "Veggie mince" });
  expect(await services.repository.proposal(alias.id)).toMatchObject({
    status: "accepted",
    risk_tier: 1,
  });
  expect((await services.repository.snapshot(f.productId)).aliases).toEqual([
    "Veggie mince",
  ]);
  expect(
    await env.DB.prepare("SELECT aliases FROM search_index WHERE entity_id=?")
      .bind(f.productId)
      .first("aliases"),
  ).toContain("Veggie mince");
  await expect(
    propose(
      { kind: "source_url", url: "https://brand.example/garden" },
      "The page contradicts this change. [fake:claim_support=CONTRADICTS]",
    ),
  ).rejects.toMatchObject({ code: "PROPOSAL_NEEDS_CHANGES", status: 422 });
  const category = await env.DB.prepare(
    "INSERT INTO categories(id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,1,1,1)",
  )
    .bind(`extra-${f.productId}`, `extra-${f.productId}`, "Extra category")
    .run();
  expect(category.meta.changes).toBe(1);
  const addition = await propose({
    kind: "category_add",
    categoryId: `extra-${f.productId}`,
  });
  await services.contributions.respond(confirmer, id(), addition.id, {
    stance: "confirm",
  });
  const applied = (await services.moderation.autoAccept(addition.id)) as {
    applied: boolean;
    actionId: string;
  };
  expect(applied.applied).toBe(true);
  expect(
    (await services.repository.snapshot(f.productId)).categories.map(
      (c) => c.categoryId,
    ),
  ).toContain(`extra-${f.productId}`);
  const reversal = await services.moderation.reverse(
    admin,
    id(),
    applied.actionId,
    {
      expectedRevision: (await services.repository.snapshot(f.productId))
        .revision,
      note: "Reversed: the category does not fit this product.",
    },
  );
  expect(
    (await services.repository.snapshot(f.productId)).categories.map(
      (c) => c.categoryId,
    ),
  ).not.toContain(`extra-${f.productId}`);
  // The category the product just left is purged along with its current ones.
  await invalidateCommunityProduct(env.DB, f.productId, {
    actionId: reversal.actionId,
  });
  expect(purged.at(-1)?.[0]?.categorySlugs).toContain(`extra-${f.productId}`);
  const open = await services.contributions.openProposals(
    confirmer,
    f.productId,
  );
  expect(open.every((p) => typeof p.summary === "string")).toBe(true);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});
