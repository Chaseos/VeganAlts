import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { communityServices } from "../../server/community/infrastructure/composition";
import {
  changeInput,
  reportInput,
} from "../../server/community/domain/contracts";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { RatingsService } from "../../server/ratings/application/service";
import { INITIAL_RANKING_PARAMETERS } from "../../server/ranking/domain/policy";
import { D1RankingReader } from "../../server/ranking/infrastructure/d1-ranking-reader";
import {
  readMedia,
  readModeratedMedia,
} from "../../server/media/infrastructure/media-reader";
import { D1MediaRepository } from "../../server/media/infrastructure/d1-repository";

const id = () => crypto.randomUUID();
const evidence = {
  urls: ["https://example.com/ingredients"],
  imageIds: [],
  note: "Manufacturer evidence establishes the proposed catalog change.",
};
async function fixture() {
  const f = await catalogFixture(env.DB, 3);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const services = communityServices(env, id),
    actor = { ...f.users[0]!, administrator: false },
    admin = { ...f.users[1]!, administrator: true };
  const ratings = new RatingsService(
      new D1RatingsRepository(env.DB),
      INITIAL_RANKING_PARAMETERS,
      id,
      () => 1791360000000,
    ),
    ranking = new D1RankingReader(env.DB);
  const propose = async (fields: Record<string, unknown>) =>
    services.contributions.propose(
      actor,
      id(),
      changeInput.parse({
        productId: f.productId,
        expectedRevision: (await services.repository.snapshot(f.productId))
          .revision,
        evidence,
        ...fields,
      }),
    );
  const accept = async (proposalId: string) =>
    services.moderation.decide(admin, id(), "proposal", proposalId, {
      decision: "accept",
      expectedRevision: (await services.repository.proposal(proposalId))!
        .updated_at,
      note: "Operator reviewed the evidence and accepted this change.",
      effect: "none",
    });
  return { f, ...services, actor, admin, ratings, ranking, propose, accept };
}
it("keeps packaging updates on the same formula, removes reported media privately, and reverses without discarding later ratings", async () => {
  const {
    f,
    submissions,
    media,
    contributions,
    moderation,
    repository,
    actor,
    admin,
    ratings,
    propose,
    accept,
  } = await fixture();
  await ratings.rate(actor, f.versionId, f.categories[0]!, 4);
  const { receiptId } = await submissions.evidenceReceipt(
    actor,
    id(),
    f.productId,
  );
  const photo = await media.upload(actor, {
    receiptId,
    slot: "front",
    idempotencyKey: id(),
    bytes: Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0)),
  });
  const proposal = await propose({
    kind: "packaging",
    evidenceReceiptId: receiptId,
    evidence: { ...evidence, imageIds: [photo.imageId] },
  });
  const accepted = await accept(proposal.id);
  const current = await repository.snapshot(f.productId);
  expect(current.versionId).toBe(f.versionId);
  expect(current.images).toContainEqual(
    expect.objectContaining({ id: photo.imageId, state: "accepted" }),
  );
  // Existing canonical evidence and newly staged evidence use the same validator.
  const classification = await propose({
    kind: "classification",
    veganStatus: "appears_vegan",
    manufacturerLabel: "unknown",
    evidence: { ...evidence, imageIds: [photo.imageId] },
  });
  expect((await repository.proposal(classification.id))?.status).toBe(
    "pending",
  );
  const request = new Request("https://example.com/media");
  expect(
    (await readMedia(env.DB, env.MEDIA_BUCKET, photo.imageId, "full", request))
      .status,
  ).toBe(200);
  const report = await contributions.report(
    actor,
    id(),
    reportInput.parse({
      targetType: "product_image",
      targetId: photo.imageId,
      reason: "wrong_product",
      note: "This test photo shows unrelated packaging.",
    }),
  );
  const removed = await moderation.decide(admin, id(), "report", report.id, {
    decision: "resolve",
    expectedRevision: (await repository.report(report.id))!.revision,
    expectedProductRevision: current.revision,
    note: "Photo concern verified; remove it from public views.",
    effect: "remove_image",
  });
  expect(
    (await readMedia(env.DB, env.MEDIA_BUCKET, photo.imageId, "full", request))
      .status,
  ).toBe(404);
  const privatePhoto = await readModeratedMedia(
    env.DB,
    env.MEDIA_BUCKET,
    photo.imageId,
    "full",
    request,
  );
  expect(privatePhoto.status).toBe(200);
  expect(privatePhoto.headers.get("Cache-Control")).toBe("private, no-store");
  if (!("actionId" in accepted) || !("actionId" in removed))
    throw new Error("Expected audited actions");
  await moderation.reverse(admin, id(), removed.actionId, {
    expectedRevision: (await repository.snapshot(f.productId)).revision,
    note: "The evidence was reassessed; restore the original photo.",
  });
  await ratings.rate(f.users[2]!, f.versionId, f.categories[0]!, 5);
  await moderation.reverse(admin, id(), accepted.actionId, {
    expectedRevision: (await repository.snapshot(f.productId)).revision,
    note: "Packaging evidence was superseded; retain the original formula.",
  });
  expect((await repository.snapshot(f.productId)).versionId).toBe(f.versionId);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) n FROM ratings WHERE product_version_id=?",
    )
      .bind(f.versionId)
      .first("n"),
  ).toBe(2);
  expect(
    await env.DB.prepare("SELECT full_r2_key FROM product_images WHERE id=?")
      .bind(photo.imageId)
      .first(),
  ).not.toBeNull();
});
it("discontinues and reintroduces equivalent or new formulas while preserving ranking rebuild equivalence", async () => {
  const { f, actor, ratings, ranking, repository, propose, accept } =
    await fixture();
  await ratings.rate(actor, f.versionId, f.categories[0]!, 4);
  await accept((await propose({ kind: "discontinue" })).id);
  expect(await ranking.top(f.countryId, f.categories[0]!)).toEqual([]);
  await expect(
    ratings.rate(f.users[2]!, f.versionId, f.categories[0]!, 5),
  ).rejects.toMatchObject({ code: "NOT_RATEABLE" });
  const fields = {
    kind: "reintroduce",
    sameFormula: true,
    versionLabel: "Equivalent recipe",
    effectiveDate: "2026",
    veganStatus: "vegan",
    manufacturerLabel: "vegan",
  };
  await accept((await propose(fields)).id);
  expect((await repository.snapshot(f.productId)).versionId).toBe(f.versionId);
  expect((await ranking.top(f.countryId, f.categories[0]!))[0]).toMatchObject({
    ratingCount: 1,
    rawAverage: 4,
  });
  await accept((await propose({ kind: "discontinue" })).id);
  await accept((await propose({ ...fields, sameFormula: false })).id);
  const current = await repository.snapshot(f.productId);
  expect(current.versionId).not.toBe(f.versionId);
  await ratings.rate(actor, current.versionId, f.categories[0]!, 2);
  const before = (
    await env.DB.prepare(
      "SELECT * FROM product_category_stats ORDER BY product_version_id,category_id",
    ).all()
  ).results;
  await ratings.rebuildPage();
  const after = (
    await env.DB.prepare(
      "SELECT * FROM product_category_stats ORDER BY product_version_id,category_id",
    ).all()
  ).results;
  // Other fixtures may gain empty aggregates on rebuild; both affected formulas must be identical.
  const affected = (rows: Record<string, unknown>[]) =>
    rows.filter(
      (r) =>
        r.product_version_id === f.versionId ||
        r.product_version_id === current.versionId,
    );
  expect(affected(after)).toEqual(affected(before));
  expect((await ranking.top(f.countryId, f.categories[0]!))[0]).toMatchObject({
    ratingCount: 1,
    rawAverage: 2,
  });
});
it("rejects competing proposals and excludes specialty variants from inappropriate categories without losing their scores", async () => {
  const { f, propose, accept, repository, ratings, ranking, actor } =
    await fixture();
  await ratings.rate(actor, f.versionId, f.categories[0]!, 4);
  const first = await propose({
      kind: "relationships",
      productFamilyId: null,
      categoryEligibility: [{ categoryId: f.categories[0], eligible: false }],
    }),
    stale = await propose({ kind: "discontinue" });
  await accept(first.id);
  await expect(accept(stale.id)).rejects.toMatchObject({
    code: "STALE_PRODUCT",
  });
  expect((await repository.proposal(stale.id))!.status).toBe("pending");
  expect(await ranking.top(f.countryId, f.categories[0]!)).toEqual([]);
  expect(
    await env.DB.prepare(
      "SELECT overall_similarity FROM ratings WHERE product_version_id=?",
    )
      .bind(f.versionId)
      .first("overall_similarity"),
  ).toBe(4);
});
it("rejects cross-country consolidations, redirect chains and new contributions to archived duplicates", async () => {
  const { f, actor, admin, moderation, repository, ratings, submissions } =
    await fixture();
  const other = id(),
    survivor = id(),
    third = id();
  for (const [product, country] of [
    [other, f.otherCountryId],
    [survivor, f.countryId],
    [third, f.countryId],
  ])
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO products(id,country_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      ).bind(product, country, product, product),
      env.DB.prepare(
        "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
      ).bind(id(), product),
    ]);
  await expect(
    moderation.previewConsolidation(admin, f.productId, other),
  ).rejects.toMatchObject({ code: "INVALID_DUPLICATE" });
  const consolidate = async (donorId: string, survivorId: string) =>
    moderation.consolidate(admin, id(), {
      donorId,
      survivorId,
      donorRevision: (await repository.snapshot(donorId)).revision,
      survivorRevision: (await repository.snapshot(survivorId)).revision,
      note: "Verified duplicate identity within the same country.",
    });
  await consolidate(f.productId, survivor);
  await expect(consolidate(survivor, third)).rejects.toMatchObject({
    code: "STALE_DECISION",
  });
  await expect(consolidate(survivor, f.productId)).rejects.toMatchObject({
    code: "INVALID_DUPLICATE",
  });
  await expect(
    ratings.rate(actor, f.versionId, f.categories[0]!, 3),
  ).rejects.toMatchObject({ code: "NOT_RATEABLE" });
  await expect(
    ratings.setTried(actor, f.versionId, true),
  ).rejects.toMatchObject({ code: "ARCHIVED_PRODUCT" });
  await expect(
    submissions.evidenceReceipt(actor, id(), f.productId),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    new D1MediaRepository(env.DB).reserve(
      {
        userId: admin.id,
        idempotencyKey: id(),
        productVersionId: f.versionId,
        slot: "front",
        contentHash: id(),
      },
      id(),
      Date.now(),
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("paginates the moderation inbox without repeats and rejects malformed cursors", async () => {
  const { f, actor, admin, moderation } = await fixture();
  await env.DB.batch(
    Array.from({ length: 35 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO edit_proposals(id,submitted_by,target_type,target_id,change_type,risk_tier,proposed_data,created_at,updated_at) VALUES(?,?,'product',?,'packaging',1,'{}',?,?)",
      ).bind(id(), actor.id, f.productId, 100 + i, 100 + i),
    ),
  );
  const found = new Set<string>();
  let cursor: string | null = null,
    pages = 0;
  do {
    const page = await moderation.inbox(admin, cursor);
    for (const item of page.items) {
      expect(found.has(`${item.kind}:${item.id}`)).toBe(false);
      found.add(`${item.kind}:${item.id}`);
    }
    cursor = page.nextCursor;
    pages++;
  } while (cursor && pages < 10);
  expect(found.size).toBeGreaterThanOrEqual(35);
  expect(pages).toBeGreaterThan(1);
  await expect(moderation.inbox(admin, "bad cursor")).rejects.toMatchObject({
    code: "INVALID_CURSOR",
  });
});
