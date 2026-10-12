import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { catalogFixture, testMarket } from "./fixtures";
import { catalogService } from "../../server/catalog/infrastructure/composition";
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
import { moderationDecisions } from "../../server/moderation/infrastructure/composition";

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
    moderationDecisions({ DB: env.DB, APP_ENV: "local" }),
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

it("publishes unconfirmed ingredients as not checked yet, and an operator's choice checks them", async () => {
  const { f, repo, media, service, input, actor } = await setup();
  const admin = { ...f.users[1]!, administrator: true };
  const classification = async (receiptId: string) =>
    env.DB.prepare(
      "SELECT vegan_status,ingredients_checked,reviewed_by FROM formula_classifications WHERE product_version_id=?",
    )
      .bind((await repo.get(receiptId))!.planned_version_id)
      .first();
  const publish = async (details: typeof input) => {
    const checked = await service.preflight(actor, id(), details);
    await media.upload(actor, {
      receiptId: checked.receiptId!,
      slot: "front",
      idempotencyKey: id(),
      bytes: photo(),
    });
    return {
      checked,
      result: await service.finalize(actor, checked.receiptId!, details),
    };
  };
  // A source without "nothing animal-derived" publishes, unchecked.
  const unconfirmed = {
    ...input,
    name: `Unconfirmed ${tag()}`,
    noKnownAnimalIngredients: false,
    manufacturerLabel: "neither" as const,
  };
  const first = await publish(unconfirmed);
  expect(first.checked.decision).toBe("READY");
  expect(await classification(first.checked.receiptId!)).toEqual({
    vegan_status: "appears_vegan",
    ingredients_checked: 0,
    reviewed_by: null,
  });
  // Readers see "unchecked", never the placeholder status.
  const product = await catalogService(env).product(
    testMarket(f.countryId),
    "slug" in first.result ? first.result.slug : "missing",
    null,
  );
  expect(product.veganStatus).toBe("unchecked");
  expect(product.classification?.veganStatus).toBe("unchecked");

  // Held for another reason, an operator without a choice keeps it unchecked;
  // a chosen classification is reviewed and checked.
  const seasonal = {
    ...unconfirmed,
    name: `Seasonal ${tag()}`,
    specialtyFlavor: true,
  };
  const second = await publish(seasonal);
  expect(second.checked.decision).toBe("NEEDS_REVIEW");
  await service.approve(
    admin,
    second.checked.receiptId!,
    seasonal,
    0,
    "Reviewed the seasonal flavor.",
  );
  expect(await classification(second.checked.receiptId!)).toMatchObject({
    ingredients_checked: 0,
    reviewed_by: null,
  });
  const holiday = { ...seasonal, name: `Holiday ${tag()}` };
  const third = await publish(holiday);
  await service.approve(
    admin,
    third.checked.receiptId!,
    holiday,
    0,
    "The operator verified the ingredient panel.",
    undefined,
    "appears_vegan",
  );
  expect(await classification(third.checked.receiptId!)).toEqual({
    vegan_status: "appears_vegan",
    ingredients_checked: 1,
    reviewed_by: admin.id,
  });
});

it("lowers an unreadable ingredients photo to not checked yet instead of holding the product", async () => {
  const { repo, media, input, actor } = await setup();
  const service = new SubmissionService(
    repo,
    new CommunityLookupRepository(env.DB),
    new StagedMediaRepository(env.DB, DEFAULT_LIMITS),
    media,
    moderationDecisions({
      DB: env.DB,
      APP_ENV: "local",
      MODERATION_PROVIDER: "fake",
    } as unknown as Cloudflare.Env),
    id,
  );
  const classify = async (note: string) => {
    const details = submissionInput.parse({
      ...input,
      name: `Panel ${tag()}`,
      ingredientUrl: undefined,
      imageSlots: ["front", "ingredients"],
      statusBasis: note,
    });
    const checked = await service.preflight(actor, id(), details);
    for (const [slot, bytes] of [
      ["front", photo()],
      [
        "ingredients",
        Uint8Array.from(atob(env.TEST_IMAGES.png), (c) => c.charCodeAt(0)),
      ],
    ] as const)
      await media.upload(actor, {
        receiptId: checked.receiptId!,
        slot,
        idempotencyKey: id(),
        bytes,
      });
    const result = await service.finalize(actor, checked.receiptId!, details);
    expect(result.decision).toBe("READY");
    return env.DB.prepare(
      "SELECT vegan_status AS status,ingredients_checked AS checked FROM formula_classifications WHERE product_version_id=?",
    )
      .bind((await repo.get(checked.receiptId!))!.planned_version_id)
      .first();
  };
  expect(await classify("The ingredient panel lists only plants.")).toEqual({
    status: "appears_vegan",
    checked: 1,
  });
  expect(
    await classify("Blurry panel photo. [fake:evidence_quality=NONE]"),
  ).toEqual({ status: "appears_vegan", checked: 0 });
});

it("publishes a front-photo-only product with its ingredients not checked yet", async () => {
  const { f, repo, media, service, actor } = await setup();
  const minimal = submissionInput.parse({
    name: `Front only ${tag()}`,
    brand: "Orchard",
    country: "US",
    categoryIds: [f.categories[0]],
    imageSlots: ["front"],
  });
  // Stores must be ones members report in the country.
  await expect(
    service.preflight(actor, id(), { ...minimal, retailerIds: ["nowhere"] }),
  ).rejects.toMatchObject({ code: "INVALID_RETAILER" });
  const checked = await service.preflight(actor, id(), minimal);
  expect(checked.decision).toBe("READY");
  await media.upload(actor, {
    receiptId: checked.receiptId!,
    slot: "front",
    idempotencyKey: id(),
    bytes: photo(),
  });
  const published = await service.finalize(actor, checked.receiptId!, minimal);
  expect(published).toMatchObject({ decision: "READY" });
  const row = await env.DB.prepare(
    "SELECT f.vegan_status AS status,f.ingredients_checked AS checked,f.manufacturer_label AS label,json_extract(f.evidence_data,'$.note') AS note FROM formula_classifications f WHERE f.product_version_id=?",
  )
    .bind((await repo.get(checked.receiptId!))!.planned_version_id)
    .first<{ note: string }>();
  expect(row).toMatchObject({
    status: "appears_vegan",
    checked: 0,
    label: "unknown",
  });
  expect(row!.note.length).toBeGreaterThanOrEqual(8);
});

it("offers every placeable food, marking the ones not on in a country yet", async () => {
  const { f } = await setup();
  const [on, off] = f.categories as [string, string];
  const aisle = `aisle-${tag()}`,
    root = `root-${tag()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at) VALUES(?,NULL,?,?,0,1,1),(?,?,?,?,0,1,1)",
    ).bind(root, root, root, aisle, root, aisle, "Beef"),
    env.DB.prepare("UPDATE categories SET parent_id=? WHERE id IN (?,?)").bind(
      aisle,
      on,
      off,
    ),
    env.DB.prepare(
      "INSERT INTO category_aliases(id,category_id,alias,created_at) VALUES(?,?,?,1)",
    ).bind(id(), off, `mince ${tag()}`),
    // Switched off where the fixture's product is not.
    env.DB.prepare(
      "DELETE FROM category_countries WHERE category_id=? AND country_id=?",
    ).bind(off, f.otherCountryId),
  ]);
  await env.DB.prepare("UPDATE countries SET iso2='CA' WHERE id=?")
    .bind(f.otherCountryId)
    .run();
  const choices = await catalogService(env).contributionChoices(
    testMarket(f.otherCountryId, "ca"),
  );
  const food = (categoryId: string) =>
    choices.foods.find((c) => c.id === categoryId);
  expect(food(off)).toMatchObject({
    inCountry: false,
    aisle: { name: "Beef", silent: false },
  });
  expect(food(off)!.otherNames[0]).toMatch(/^mince/);
  expect(choices.aisles.map((a) => a.id)).toContain(aisle);
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

it("publishes a product added from another country's page in that country only", async () => {
  const { f, repo, media, service, input, actor } = await setup();
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='CA'").run();
  await env.DB.prepare("UPDATE countries SET iso2='CA' WHERE id=?")
    .bind(f.otherCountryId)
    .run();
  const canadian = submissionInput.parse({
    ...input,
    name: `Maple patties ${tag()}`,
    country: "ca",
  });
  const checked = await service.preflight(actor, id(), canadian);
  expect(checked.decision).toBe("READY");
  const receipt = (await repo.get(checked.receiptId!))!;
  await media.upload(actor, {
    receiptId: receipt.id,
    slot: "front",
    idempotencyKey: id(),
    bytes: Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0)),
  });
  await service.finalize(actor, receipt.id, canadian);
  expect(
    await env.DB.prepare("SELECT country_id FROM products WHERE id=?")
      .bind(receipt.planned_product_id)
      .first("country_id"),
  ).toBe(f.otherCountryId);
  // The same name in the United States is a different product.
  expect(
    (
      await service.preflight(actor, id(), {
        ...canadian,
        country: "US",
      })
    ).decision,
  ).toBe("READY");
});
