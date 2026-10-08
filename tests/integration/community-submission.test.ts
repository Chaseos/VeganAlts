import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { catalogFixture } from "./fixtures";
import { SubmissionService } from "../../server/community/application/submission-service";
import { StagedMediaService } from "../../server/community/application/staged-media-service";
import { SubmissionRepository } from "../../server/community/infrastructure/submission-repository";
import { StagedMediaRepository } from "../../server/community/infrastructure/staged-media-repository";
import { CommunityLookupRepository } from "../../server/community/infrastructure/lookup-repository";
import { R2EvidenceStorage } from "../../server/community/infrastructure/evidence-storage";
import { CloudflareImageTransformer } from "../../server/media/infrastructure/cloudflare-images";
import {
  DEFAULT_LIMITS,
  normalizeName,
} from "../../server/community/domain/policy";
import { submissionInput } from "../../server/community/domain/contracts";
import { communityServices } from "../../server/community/infrastructure/composition";

const id = () => crypto.randomUUID();
async function setup() {
  const f = await catalogFixture(env.DB, 2);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const repo = new SubmissionRepository(env.DB, DEFAULT_LIMITS),
    staged = new StagedMediaRepository(env.DB, DEFAULT_LIMITS);
  const transformer = new CloudflareImageTransformer(env.IMAGES);
  const media = new StagedMediaService(
    staged,
    new R2EvidenceStorage(env.MEDIA_BUCKET),
    transformer,
    id,
  );
  const service = new SubmissionService(
    repo,
    new CommunityLookupRepository(env.DB),
    staged,
    media,
    id,
  );
  const input = submissionInput.parse({
    name: "Garden patties",
    brand: "Orchard",
    country: "US",
    categoryIds: [f.categories[0]],
    imageSlots: ["front"],
    ingredientUrl: "https://example.com/ingredients",
    statusBasis:
      "The manufacturer ingredient list contains no known animal ingredients.",
    noKnownAnimalIngredients: true,
    manufacturerLabel: "vegan",
  });
  return {
    f,
    repo,
    media,
    service,
    transformer,
    input,
    actor: { ...f.users[0]!, administrator: false },
  };
}

it("publishes atomically from private media, replays keys and rejects package-size duplicates before processing", async () => {
  const { f, repo, media, service, transformer, input, actor } = await setup();
  const key = id(),
    checked = await service.preflight(actor, key, input);
  expect(checked.decision).toBe("READY");
  const receipt = (await repo.get(checked.receiptId!))!;
  expect(
    await env.DB.prepare("SELECT id FROM products WHERE id=?")
      .bind(receipt.planned_product_id)
      .first(),
  ).toBeNull();
  await expect(
    service.finalize(actor, receipt.id, input),
  ).rejects.toMatchObject({ code: "EVIDENCE_REQUIRED" });
  const transform = vi.spyOn(transformer, "transform");
  const bytes = Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) =>
    c.charCodeAt(0),
  );
  const photo = await media.upload(actor, {
    receiptId: receipt.id,
    slot: "front",
    idempotencyKey: id(),
    bytes,
  });
  await media.upload(actor, {
    receiptId: receipt.id,
    slot: "front",
    idempotencyKey: id(),
    bytes,
  });
  expect(transform).toHaveBeenCalledTimes(2);
  await expect(
    media.read(
      { ...f.users[1]!, administrator: false },
      receipt.id,
      photo.imageId,
      "full",
    ),
  ).rejects.toMatchObject({ status: 404 });
  const published = await service.finalize(actor, receipt.id, input);
  expect(published).toMatchObject({
    decision: "READY",
    productId: receipt.planned_product_id,
  });
  expect(await service.finalize(actor, receipt.id, input)).toEqual(published);
  expect(await service.preflight(actor, key, input)).toMatchObject({
    receiptId: receipt.id,
    state: "published",
  });
  expect(
    await env.DB.prepare("SELECT vegan_status FROM products WHERE id=?")
      .bind(receipt.planned_product_id)
      .first("vegan_status"),
  ).toBe("appears_vegan");
  expect(
    await env.DB.prepare("SELECT entity_id FROM search_index WHERE entity_id=?")
      .bind(receipt.planned_product_id)
      .first("entity_id"),
  ).toBe(receipt.planned_product_id);
  expect(
    await env.DB.prepare(
      "SELECT * FROM pending_submissions WHERE submission_id=?",
    )
      .bind(receipt.id)
      .first(),
  ).toBeNull();
  expect(
    await service.preflight(actor, id(), {
      ...input,
      name: "Garden patties 12 oz",
    }),
  ).toMatchObject({ decision: "NEEDS_CHANGES", receiptId: null });
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});

it("holds ambiguous submissions without canonical records and publishes only after operator review", async () => {
  const { repo, media, service, input, actor } = await setup();
  const held = { ...input, specialtyFlavor: true };
  const checked = await service.preflight(actor, id(), held),
    receipt = (await repo.get(checked.receiptId!))!;
  await media.upload(actor, {
    receiptId: receipt.id,
    slot: "front",
    idempotencyKey: id(),
    bytes: Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0)),
  });
  expect(await service.finalize(actor, receipt.id, held)).toMatchObject({
    decision: "NEEDS_REVIEW",
  });
  expect(
    await env.DB.prepare("SELECT id FROM products WHERE id=?")
      .bind(receipt.planned_product_id)
      .first(),
  ).toBeNull();
  await expect(
    service.approve(actor, receipt.id, held, 0, "Evidence reviewed."),
  ).rejects.toMatchObject({ status: 403 });
  const results = await Promise.allSettled([
    service.approve(
      { ...actor, administrator: true },
      receipt.id,
      held,
      0,
      "Evidence reviewed.",
    ),
    service.approve(
      { ...actor, administrator: true },
      receipt.id,
      held,
      0,
      "Competing decision.",
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM product_versions WHERE product_id=?",
    )
      .bind(receipt.planned_product_id)
      .first("n"),
  ).toBe(1);
  expect(
    await env.DB.prepare(
      "SELECT ranking_eligible FROM product_categories WHERE product_id=?",
    )
      .bind(receipt.planned_product_id)
      .first("ranking_eligible"),
  ).toBe(0);
});

it("accepts an owned follow-up once, preserving original evidence and requiring another operator review", async () => {
  const { f, repo, media, service, transformer, input, actor } = await setup();
  const { moderation } = communityServices(env, id);
  const admin = { ...f.users[1]!, administrator: true };
  const held = { ...input, specialtyFlavor: true };
  const originalId = (await service.preflight(actor, id(), held)).receiptId!;
  const original = (await repo.get(originalId))!;
  const bytes = Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) =>
    c.charCodeAt(0),
  );
  const transform = vi.spyOn(transformer, "transform");
  const photo = await media.upload(actor, {
    receiptId: originalId,
    slot: "front",
    idempotencyKey: id(),
    bytes,
  });
  await service.finalize(actor, originalId, held);
  await expect(service.revisionSource(actor, originalId)).rejects.toMatchObject(
    { status: 409 },
  );
  await moderation.decide(admin, id(), "submission", originalId, {
    decision: "follow_up",
    expectedRevision: 0,
    effect: "none",
    note: "Please clarify the category and provide the manufacturer ingredient source.",
  });
  const source = await service.revisionSource(actor, originalId);
  expect(source).toMatchObject({ expectedRevision: 1, input: held });
  await expect(service.revisionSource(admin, originalId)).rejects.toMatchObject(
    { status: 404 },
  );
  const revised = {
    ...input,
    statusBasis: "Corrected manufacturer evidence for the original recipe.",
    followUp: {
      submissionId: originalId,
      expectedRevision: source.expectedRevision,
    },
  };
  await expect(
    service.preflight(actor, id(), {
      ...revised,
      followUp: { ...revised.followUp, expectedRevision: 0 },
    }),
  ).rejects.toMatchObject({ status: 409 });
  const key = id(),
    checked = await service.preflight(actor, key, revised);
  expect(checked.decision).toBe("NEEDS_REVIEW");
  const childId = checked.receiptId!;
  await expect(service.finalize(actor, childId, revised)).rejects.toMatchObject(
    { code: "EVIDENCE_REQUIRED" },
  );
  expect((await repo.get(originalId))!.state).toBe("review");
  expect(
    await moderation.detail(actor, "submission", originalId),
  ).toMatchObject({ canFollowUp: true });
  const competingId = (await service.preflight(actor, id(), revised))
    .receiptId!;
  for (const receiptId of [childId, competingId])
    await media.upload(actor, {
      receiptId,
      slot: "front",
      idempotencyKey: id(),
      bytes,
    });
  expect(transform).toHaveBeenCalledTimes(2); // Full-size and thumbnail reused across all receipts.
  const results = await Promise.allSettled([
    service.finalize(actor, childId, revised),
    service.finalize(actor, competingId, revised),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const successor = (await repo.followUpSource(originalId, actor.id))!
    .superseded_by!;
  expect([childId, competingId]).toContain(successor);
  expect(await service.finalize(actor, successor, revised)).toMatchObject({
    decision: "NEEDS_REVIEW",
  });
  expect(await service.preflight(actor, key, revised)).toMatchObject({
    receiptId: childId,
  });
  expect(
    await moderation.detail(actor, "submission", originalId),
  ).toMatchObject({
    status: "superseded",
    supersededBy: successor,
    canFollowUp: false,
    proposed: held,
  });
  expect(await moderation.detail(actor, "submission", successor)).toMatchObject(
    { status: "review", followUpOf: originalId },
  );
  expect(
    await media.read(actor, originalId, photo.imageId, "full"),
  ).toBeTruthy();
  const audits = await env.DB.prepare(
    "SELECT before_data,after_data FROM audit_log WHERE action='submission_amended' AND entity_id=?",
  )
    .bind(originalId)
    .all<{ before_data: string; after_data: string }>();
  expect(audits.results).toHaveLength(1);
  expect(JSON.parse(audits.results[0]!.before_data)).toMatchObject({
    proposed: held,
    revision: 1,
  });
  expect(JSON.parse(audits.results[0]!.after_data)).toMatchObject({
    supersededBy: successor,
    proposed: revised,
  });
  const inbox = await moderation.inbox(admin, null);
  expect(
    inbox.items.filter((item) =>
      [originalId, childId, competingId].includes(item.id),
    ),
  ).toMatchObject([{ id: successor }]);
  expect(
    (await moderation.contributions(actor, null)).items.find(
      (item) => item.id === originalId,
    )?.status,
  ).toBe("superseded");
  for (const receiptId of [originalId, childId, competingId]) {
    const receipt = (await repo.get(receiptId))!;
    expect(
      await env.DB.prepare("SELECT id FROM products WHERE id=?")
        .bind(receipt.planned_product_id)
        .first(),
    ).toBeNull();
  }
  await expect(
    service.approve(admin, originalId, held, 1, "Stale original decision."),
  ).rejects.toMatchObject({ status: 409 });
  await expect(service.preflight(actor, id(), revised)).rejects.toMatchObject({
    status: 409,
  });
  const published = await service.approve(
    admin,
    successor,
    revised,
    0,
    "Updated evidence reviewed.",
  );
  expect(published.decision).toBe("READY");
  expect(published.productId).not.toBe(original.planned_product_id);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});

it("fences a follow-up against an operator decision made during finalization", async () => {
  const { f, repo, media, service, input, actor } = await setup();
  const { moderation } = communityServices(env, id);
  const admin = { ...f.users[1]!, administrator: true };
  const held = { ...input, specialtyFlavor: true };
  const originalId = (await service.preflight(actor, id(), held)).receiptId!;
  const bytes = Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) =>
    c.charCodeAt(0),
  );
  await media.upload(actor, {
    receiptId: originalId,
    slot: "front",
    idempotencyKey: id(),
    bytes,
  });
  await service.finalize(actor, originalId, held);
  await moderation.decide(admin, id(), "submission", originalId, {
    decision: "follow_up",
    expectedRevision: 0,
    effect: "none",
    note: "Please supply clearer manufacturer evidence.",
  });
  const revised = {
    ...input,
    followUp: { submissionId: originalId, expectedRevision: 1 },
  };
  const childId = (await service.preflight(actor, id(), revised)).receiptId!;
  await media.upload(actor, {
    receiptId: childId,
    slot: "front",
    idempotencyKey: id(),
    bytes,
  });
  const hold = repo.hold.bind(repo);
  vi.spyOn(repo, "hold").mockImplementationOnce(async (...args) => {
    await moderation.decide(admin, id(), "submission", originalId, {
      decision: "reject",
      expectedRevision: 1,
      effect: "none",
      note: "A different decision closed the original submission.",
    });
    return hold(...args);
  });
  await expect(service.finalize(actor, childId, revised)).rejects.toMatchObject(
    { code: "SUBMISSION_CHANGED" },
  );
  expect((await repo.get(originalId))!.state).toBe("rejected");
  expect((await repo.get(childId))!.state).toBe("staging");
  expect(await repo.followUpSource(childId, actor.id)).toBeNull();
  expect(
    await env.DB.prepare(
      "SELECT id FROM audit_log WHERE action='submission_amended' AND entity_id=?",
    )
      .bind(originalId)
      .first(),
  ).toBeNull();
});

const photo = () =>
  Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0));
const tag = () => crypto.randomUUID().replaceAll("-", "").slice(0, 10);

it("replays a preflight key with the receipt's actual outcome", async () => {
  const { media, service, input, actor } = await setup();
  const held = {
    ...input,
    name: `Replay held ${tag()}`,
    specialtyFlavor: true,
  };
  const key = id(),
    first = await service.preflight(actor, key, held);
  expect(first.decision).toBe("NEEDS_REVIEW");
  expect(await service.preflight(actor, key, held)).toMatchObject({
    decision: "NEEDS_REVIEW",
    receiptId: first.receiptId,
    reasons: first.reasons,
  });
  await media.upload(actor, {
    receiptId: first.receiptId!,
    slot: "front",
    idempotencyKey: id(),
    bytes: photo(),
  });
  await service.finalize(actor, first.receiptId!, held);
  expect(await service.preflight(actor, key, held)).toMatchObject({
    decision: "NEEDS_REVIEW",
    state: "review",
    reasons: first.reasons,
  });
  const expiring = { ...input, name: `Replay expiring ${tag()}` },
    expiringKey = id(),
    staged = await service.preflight(actor, expiringKey, expiring);
  await env.DB.prepare("UPDATE submission_receipts SET expires_at=1 WHERE id=?")
    .bind(staged.receiptId)
    .run();
  await expect(
    service.preflight(actor, expiringKey, expiring),
  ).rejects.toMatchObject({ code: "SUBMISSION_CLOSED" });
  const ready = { ...input, name: `Replay published ${tag()}` },
    readyKey = id(),
    checked = await service.preflight(actor, readyKey, ready);
  await media.upload(actor, {
    receiptId: checked.receiptId!,
    slot: "front",
    idempotencyKey: id(),
    bytes: photo(),
  });
  const published = await service.finalize(actor, checked.receiptId!, ready);
  expect(await service.preflight(actor, readyKey, ready)).toMatchObject({
    decision: "READY",
    slug: "slug" in published ? published.slug : "missing",
  });
});

it("requires an operator classification before publishing unconfirmed ingredients", async () => {
  const { f, repo, media, service, input, actor } = await setup();
  const admin = { ...f.users[1]!, administrator: true };
  const unconfirmed = {
    ...input,
    name: `Unconfirmed ${tag()}`,
    noKnownAnimalIngredients: false,
    manufacturerLabel: "neither" as const,
  };
  const checked = await service.preflight(actor, id(), unconfirmed);
  expect(checked.decision).toBe("NEEDS_REVIEW");
  await media.upload(actor, {
    receiptId: checked.receiptId!,
    slot: "front",
    idempotencyKey: id(),
    bytes: photo(),
  });
  await service.finalize(actor, checked.receiptId!, unconfirmed);
  await expect(
    service.approve(admin, checked.receiptId!, unconfirmed, 0, "Reviewed."),
  ).rejects.toMatchObject({ code: "CLASSIFICATION_REQUIRED" });
  await service.approve(
    admin,
    checked.receiptId!,
    unconfirmed,
    0,
    "The operator verified the ingredient panel.",
    undefined,
    "appears_vegan",
  );
  const receipt = (await repo.get(checked.receiptId!))!;
  expect(
    await env.DB.prepare(
      "SELECT vegan_status,reviewed_by FROM formula_classifications WHERE product_version_id=?",
    )
      .bind(receipt.planned_version_id)
      .first(),
  ).toEqual({ vegan_status: "appears_vegan", reviewed_by: admin.id });
});

it("checks large brands without a hard limit, ranks alias matches first and keeps the matched brand", async () => {
  const { f, media, service, input, actor } = await setup();
  const t = tag(),
    brandId = id(),
    brand = `Legacy ${t}`,
    aliased = `aliased-${t}`;
  // A legacy brand whose stored key predates application normalization.
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    ).bind(brandId, `${brand} Foods`, `stale-${t}`, `legacy-${t}`),
    env.DB.prepare(
      "INSERT INTO brand_aliases(normalized_name,alias,brand_id) VALUES(?,?,?)",
    ).bind(normalizeName(brand), brand, brandId),
    ...Array.from({ length: 230 }, (_, i) =>
      env.DB.prepare(
        "INSERT INTO products(id,country_id,brand_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
      ).bind(
        `bulk-${t}-${i}`,
        f.countryId,
        brandId,
        `Style Shreds ${i}`,
        `bulk-${t}-${i}`,
      ),
    ),
    env.DB.prepare(
      "INSERT INTO products(id,country_id,brand_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
    ).bind(aliased, f.countryId, brandId, "Classic Mozz", aliased),
    env.DB.prepare(
      "INSERT INTO product_aliases(id,product_id,alias,created_at) VALUES(?,?,?,1)",
    ).bind(id(), aliased, "Mozzarella Style Shreds"),
  ]);
  const duplicate = await service.preflight(actor, id(), {
    ...input,
    brand,
    name: "Mozzarella Style Shreds",
  });
  expect(duplicate.decision).toBe("NEEDS_CHANGES");
  expect(duplicate.candidates[0]).toMatchObject({ id: aliased, exact: true });
  expect(duplicate.candidates.length).toBeLessThanOrEqual(12);
  const fresh = { ...input, brand, name: "Smoked Gouda Wheel" },
    checked = await service.preflight(actor, id(), fresh);
  expect(checked.decision).toBe("READY");
  await media.upload(actor, {
    receiptId: checked.receiptId!,
    slot: "front",
    idempotencyKey: id(),
    bytes: photo(),
  });
  const published = await service.finalize(actor, checked.receiptId!, fresh);
  expect(
    await env.DB.prepare("SELECT brand_id FROM products WHERE id=?")
      .bind("productId" in published ? published.productId : null)
      .first("brand_id"),
  ).toBe(brandId);
});
