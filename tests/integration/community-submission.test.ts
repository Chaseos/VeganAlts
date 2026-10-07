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
import { DEFAULT_LIMITS } from "../../server/community/domain/policy";
import { submissionInput } from "../../server/community/domain/contracts";

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
