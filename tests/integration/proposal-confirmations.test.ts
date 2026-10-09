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

it("does not accept an addition to a category retired after the proposal", async () => {
  const { f, services, confirmer, propose } = await fixture();
  const category = `retiring-${f.productId}`;
  await env.DB.prepare(
    "INSERT INTO categories(id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,1,1,1)",
  )
    .bind(category, category, "Retiring category")
    .run();
  const addition = await propose({
    kind: "category_add",
    categoryId: category,
  });
  await services.contributions.respond(confirmer, id(), addition.id, {
    stance: "confirm",
  });
  await env.DB.prepare("UPDATE categories SET is_active=0 WHERE id=?")
    .bind(category)
    .run();
  await expect(
    services.moderation.autoAccept(addition.id),
  ).rejects.toMatchObject({ code: "CATEGORY_UNAVAILABLE" });
  expect(
    await env.DB.prepare("SELECT status FROM edit_proposals WHERE id=?")
      .bind(addition.id)
      .first("status"),
  ).toBe("pending");
});

it("rotates automation past proposals that stay ineligible", async () => {
  const { f, services, confirmer, propose } = await fixture({
    PROPOSAL_AUTO_APPLY: '{"minAgeHours":0,"perPass":1}',
  });
  // The oldest candidate never becomes eligible: no automated check ran.
  const manual = communityServices(
    { ...env, APP_ENV: "local", PROPOSAL_AUTO_APPLY: '{"minAgeHours":0}' },
    id,
  );
  const stuck = await manual.contributions.propose(
    { ...f.users[0]!, administrator: false },
    id(),
    changeInput.parse({
      productId: f.productId,
      expectedRevision: (await manual.repository.snapshot(f.productId))
        .revision,
      evidence,
      kind: "alias",
      alias: "Unchecked alias",
    }),
  );
  await env.DB.prepare("UPDATE edit_proposals SET created_at=1 WHERE id=?")
    .bind(stuck.id)
    .run();
  const eligible = await propose({ kind: "rename", name: "Rotated name" });
  await services.contributions.respond(confirmer, id(), eligible.id, {
    stance: "confirm",
  });
  const candidates = (await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM edit_proposals WHERE target_type='product' AND status='pending' AND risk_tier<=2 AND disagree_count=0 AND (risk_tier=1 OR confirm_count>0)",
  ).first<number>("n"))!;
  for (let pass = 0; pass < candidates; pass++)
    await services.moderation.sweepProposals();
  expect(
    await env.DB.prepare("SELECT status FROM edit_proposals WHERE id=?")
      .bind(eligible.id)
      .first("status"),
  ).toBe("accepted");
});

it("does not count a confirmation from an account suspended before the sweep", async () => {
  const { services, confirmer, propose } = await fixture();
  const proposal = await propose({ kind: "rename", name: "Suspended support" });
  await services.contributions.respond(confirmer, id(), proposal.id, {
    stance: "confirm",
  });
  await env.DB.prepare(
    "UPDATE profiles SET account_state='suspended' WHERE user_id=?",
  )
    .bind(confirmer.id)
    .run();
  expect(await services.moderation.autoAccept(proposal.id)).toMatchObject({
    applied: false,
    reason: "confirmations",
  });
});

it("considers a proposal again once its only disagreeing account is suspended", async () => {
  const { services, confirmer, second, propose } = await fixture();
  const proposal = await propose({
    kind: "rename",
    name: "Disputed then cleared",
  });
  await services.contributions.respond(confirmer, id(), proposal.id, {
    stance: "confirm",
  });
  await services.contributions.respond(second, id(), proposal.id, {
    stance: "disagree",
    note: "The package shows a different name.",
  });
  await env.DB.prepare(
    "UPDATE profiles SET account_state='suspended' WHERE user_id=?",
  )
    .bind(second.id)
    .run();
  for (let pass = 0; pass < 5; pass++)
    await services.moderation.sweepProposals();
  expect(
    await env.DB.prepare("SELECT status FROM edit_proposals WHERE id=?")
      .bind(proposal.id)
      .first("status"),
  ).toBe("accepted");
});

async function labelled(f: Awaited<ReturnType<typeof catalogFixture>>) {
  const panel = `panel-${f.versionId}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO country_allergens(country_id,allergen_key,position) VALUES(?,'milk',0),(?,'soy',1),(?,'wheat',2),(?,'sesame',3)",
    ).bind(f.countryId, f.countryId, f.countryId, f.countryId),
    env.DB.prepare(
      "INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,created_at,updated_at) VALUES(?,?,'ingredients','accepted',?,1,1)",
    ).bind(panel, f.versionId, `test/${panel}`),
  ]);
  return panel;
}
const declaration = async (versionId: string) => ({
  status: await env.DB.prepare(
    "SELECT status FROM product_version_allergen_declarations WHERE product_version_id=?",
  )
    .bind(versionId)
    .first<string>("status"),
  rows: (
    await env.DB.prepare(
      "SELECT allergen_key||':'||presence AS row FROM product_version_allergens WHERE product_version_id=? ORDER BY row",
    )
      .bind(versionId)
      .all<{ row: string }>()
  ).results.map((r) => r.row),
});

it("accepts a confirmed allergen declaration that cites the label photo, reversibly", async () => {
  const { f, services, confirmer, second, admin, propose } = await fixture();
  const panel = await labelled(f);
  await expect(
    propose({
      kind: "allergens",
      declaration: {
        status: "declared",
        contains: ["mustard"],
        mayContain: [],
      },
      citedImageId: panel,
    }),
  ).rejects.toMatchObject({ code: "INVALID_ALLERGEN" });
  const proposal = await propose({
    kind: "allergens",
    declaration: {
      status: "declared",
      contains: ["wheat", "soy"],
      mayContain: ["sesame"],
    },
    citedImageId: panel,
  });
  expect(await services.repository.proposal(proposal.id)).toMatchObject({
    risk_tier: 2,
  });
  // A disagreement holds it for an operator.
  await services.contributions.respond(second, id(), proposal.id, {
    stance: "disagree",
    note: "My package lists sesame as an ingredient, not may contain.",
  });
  await services.contributions.respond(confirmer, id(), proposal.id, {
    stance: "confirm",
  });
  expect(await services.moderation.autoAccept(proposal.id)).toMatchObject({
    applied: false,
    reason: "disagreement",
  });
  await services.contributions.respond(second, id(), proposal.id, {
    stance: "confirm",
  });
  expect(await services.moderation.sweepProposals()).toHaveLength(1);
  expect(await declaration(f.versionId)).toEqual({
    status: "declared",
    rows: ["sesame:may_contain", "soy:contains", "wheat:contains"],
  });
  expect(
    await env.DB.prepare(
      "SELECT source_proposal_id FROM product_version_allergen_declarations WHERE product_version_id=?",
    )
      .bind(f.versionId)
      .first("source_proposal_id"),
  ).toBe(proposal.id);
  expect((await services.repository.snapshot(f.productId)).allergens).toEqual({
    status: "declared",
    contains: ["soy", "wheat"],
    mayContain: ["sesame"],
  });

  // A later "none declared" correction replaces it; reversal restores it,
  // with its evidence and source proposal.
  const provenance = () =>
    env.DB.prepare(
      "SELECT evidence_data,source_proposal_id FROM product_version_allergen_declarations WHERE product_version_id=?",
    )
      .bind(f.versionId)
      .first();
  const original = await provenance();
  expect(original).toMatchObject({ source_proposal_id: proposal.id });
  const correction = await propose({
    kind: "allergens",
    declaration: { status: "none_declared" },
    citedImageId: panel,
  });
  const snapshot = await services.repository.snapshot(f.productId);
  await services.moderation.decide(admin, id(), "proposal", correction.id, {
    decision: "accept",
    expectedRevision: (await services.repository.proposal(correction.id))!
      .updated_at,
    expectedProductRevision: snapshot.revision,
    note: "The current package no longer lists allergens.",
    effect: "none",
  });
  expect(await declaration(f.versionId)).toEqual({
    status: "none_declared",
    rows: [],
  });
  const action = await env.DB.prepare(
    "SELECT id FROM moderation_actions WHERE target_id=? AND kind='proposal_accept'",
  )
    .bind(correction.id)
    .first<string>("id");
  await services.moderation.reverse(admin, id(), action!, {
    expectedRevision: (await services.repository.snapshot(f.productId))
      .revision,
    note: "Reversed: the photo was of an older package.",
  });
  expect(await declaration(f.versionId)).toEqual({
    status: "declared",
    rows: ["sesame:may_contain", "soy:contains", "wheat:contains"],
  });
  expect(await provenance()).toEqual(original);
});

it("keeps a declaration that contradicts the classification with operators and opens a review", async () => {
  const { f, services, confirmer, second, third, propose } = await fixture();
  const panel = await labelled(f);
  const proposal = await propose({
    kind: "allergens",
    declaration: {
      status: "declared",
      contains: ["milk", "soy"],
      mayContain: [],
    },
    citedImageId: panel,
  });
  expect(await services.repository.proposal(proposal.id)).toMatchObject({
    risk_tier: 3,
  });
  const report = await env.DB.prepare(
    "SELECT reporter_user_id,target_id,reason_code,status,note FROM reports WHERE id=?",
  )
    .bind(`concern-${proposal.id}`)
    .first<Record<string, string>>();
  expect(report).toMatchObject({
    reporter_user_id: SYSTEM_ACTOR_ID,
    target_id: f.productId,
    reason_code: "ingredient_concern",
    status: "open",
  });
  expect(report!.note).toContain(proposal.id);
  for (const user of [confirmer, second, third])
    await services.contributions.respond(user, id(), proposal.id, {
      stance: "confirm",
    });
  expect(await services.moderation.autoAccept(proposal.id)).toMatchObject({
    applied: false,
    reason: "protected",
  });
  expect((await declaration(f.versionId)).status).toBeNull();
  // Without a cited label photo, even a harmless declaration waits.
  const uncited = await propose(
    {
      kind: "allergens",
      declaration: { status: "declared", contains: ["soy"], mayContain: [] },
    },
    "The manufacturer page lists soy in the allergen statement.",
  );
  expect(await services.repository.proposal(uncited.id)).toMatchObject({
    risk_tier: 3,
  });
});

it("starts a reformulated formula undeclared and restores the old declaration with it", async () => {
  const { f, services, admin, propose } = await fixture();
  await labelled(f);
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO product_version_allergen_declarations(product_version_id,status,evidence_data,created_at,updated_at) VALUES(?,'declared','{}',1,1)",
    ).bind(f.versionId),
    env.DB.prepare(
      "INSERT INTO product_version_allergens(product_version_id,allergen_key,presence) VALUES(?,'soy','contains')",
    ).bind(f.versionId),
  ]);
  const decide = async (proposalId: string) =>
    services.moderation.decide(admin, id(), "proposal", proposalId, {
      decision: "accept",
      expectedRevision: (await services.repository.proposal(proposalId))!
        .updated_at,
      expectedProductRevision: (await services.repository.snapshot(f.productId))
        .revision,
      note: "Reviewed the new recipe evidence.",
      effect: "none",
    });
  const reformulation = await propose({
    kind: "reformulation",
    versionLabel: "New recipe",
    effectiveDate: "2026-09",
    veganStatus: "vegan",
    manufacturerLabel: "plant_based",
  });
  await decide(reformulation.id);
  const current = await services.repository.snapshot(f.productId);
  expect(current.versionId).not.toBe(f.versionId);
  expect(current.allergens).toBeNull();
  expect((await declaration(f.versionId)).rows).toEqual(["soy:contains"]);
  const action = await env.DB.prepare(
    "SELECT id FROM moderation_actions WHERE target_id=? AND kind='proposal_accept'",
  )
    .bind(reformulation.id)
    .first<string>("id");
  await services.moderation.reverse(admin, id(), action!, {
    expectedRevision: current.revision,
    note: "Reversed: the old recipe is still on shelves.",
  });
  expect((await services.repository.snapshot(f.productId)).allergens).toEqual({
    status: "declared",
    contains: ["soy"],
    mayContain: [],
  });
  // A key off the country's list never reaches storage.
  await expect(
    env.DB.prepare(
      "INSERT INTO product_version_allergens(product_version_id,allergen_key,presence) VALUES(?,'lupin','contains')",
    )
      .bind(f.versionId)
      .run(),
  ).rejects.toThrow();
});
