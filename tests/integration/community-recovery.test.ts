import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { catalogFixture } from "./fixtures";
import {
  DEFAULT_LIMITS,
  DAY,
  LEASE,
} from "../../server/community/domain/policy";
import { submissionInput } from "../../server/community/domain/contracts";
import { StagedMediaRepository } from "../../server/community/infrastructure/staged-media-repository";
import { SubmissionRepository } from "../../server/community/infrastructure/submission-repository";
import { CommunityLookupRepository } from "../../server/community/infrastructure/lookup-repository";
import { R2EvidenceStorage } from "../../server/community/infrastructure/evidence-storage";
import { StagedMediaService } from "../../server/community/application/staged-media-service";
import { SubmissionService } from "../../server/community/application/submission-service";
import { CloudflareImageTransformer } from "../../server/media/infrastructure/cloudflare-images";
import {
  mayDeleteCommunityObject,
  recoverCommunity,
} from "../../server/community/infrastructure/recovery";
import { readMedia } from "../../server/media/infrastructure/media-reader";

const id = () => crypto.randomUUID(),
  bytes = () =>
    Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0));
async function setup(overrides: Partial<typeof DEFAULT_LIMITS> = {}) {
  const f = await catalogFixture(env.DB, 2);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const limits = { ...DEFAULT_LIMITS, ...overrides },
    clock = { now: Date.now() },
    staged = new StagedMediaRepository(env.DB, limits),
    receipts = new SubmissionRepository(env.DB, limits),
    storage = new R2EvidenceStorage(env.MEDIA_BUCKET),
    transformer = new CloudflareImageTransformer(env.IMAGES);
  const media = new StagedMediaService(
      staged,
      storage,
      transformer,
      id,
      () => clock.now,
    ),
    service = new SubmissionService(
      receipts,
      new CommunityLookupRepository(env.DB),
      staged,
      media,
      id,
      () => clock.now,
    );
  const input = submissionInput.parse({
    name: "Recovery patties",
    brand: `Recovery ${id()}`,
    country: "US",
    categoryIds: [f.categories[0]],
    imageSlots: ["front"],
    ingredientUrl: "https://example.com/ingredients",
    statusBasis:
      "Synthetic manufacturer ingredient evidence for recovery verification.",
    manufacturerLabel: "vegan",
    noKnownAnimalIngredients: true,
  });
  return {
    f,
    clock,
    staged,
    receipts,
    storage,
    transformer,
    media,
    service,
    input,
    actor: { ...f.users[0]!, administrator: false },
  };
}
it("enforces staged byte and concurrent attempt quotas before expensive processing", async () => {
  const { actor, service, input, media, transformer, staged, clock } =
    await setup({ accountBytes: bytes().length - 1 });
  const receipt = (await service.preflight(actor, id(), input)).receiptId!;
  const inspect = vi.spyOn(transformer, "inspect");
  await expect(
    media.upload(actor, {
      receiptId: receipt,
      slot: "front",
      idempotencyKey: id(),
      bytes: bytes(),
    }),
  ).rejects.toMatchObject({ code: "UPLOAD_LIMIT_OR_CONFLICT" });
  expect(inspect).not.toHaveBeenCalled();
  const constrained = new StagedMediaRepository(env.DB, {
    ...DEFAULT_LIMITS,
    concurrentUploads: 1,
    submissionBytes: 10,
  });
  await expect(
    constrained.reserve({
      userId: actor.id,
      submissionId: receipt,
      slot: "ingredients",
      key: id(),
      hash: id(),
      profile: "evidence-v1",
      bytes: 11,
      blobId: id(),
      imageId: id(),
      now: clock.now,
    }),
  ).rejects.toMatchObject({ code: "UPLOAD_LIMIT_OR_CONFLICT" });
  const repo = new StagedMediaRepository(env.DB, {
    ...DEFAULT_LIMITS,
    concurrentUploads: 1,
  });
  const a = await repo.reserve({
    userId: actor.id,
    submissionId: receipt,
    slot: "back",
    key: id(),
    hash: id(),
    profile: "standard-v1",
    bytes: 1,
    blobId: id(),
    imageId: id(),
    now: clock.now,
  });
  const b = await repo.reserve({
    userId: actor.id,
    submissionId: receipt,
    slot: "ingredients",
    key: id(),
    hash: id(),
    profile: "evidence-v1",
    bytes: 1,
    blobId: id(),
    imageId: id(),
    now: clock.now,
  });
  const claims = await Promise.all([
    repo.claim(a, actor.id, id(), clock.now),
    repo.claim(b, actor.id, id(), clock.now),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  expect((await staged.attachments(receipt)).length).toBe(2);
});
it("fences expired processing leases and removes delayed writes while retaining held evidence until expiration", async () => {
  const { actor, service, input, media, staged, clock, storage } =
    await setup();
  const receipt = (
    await service.preflight(actor, id(), { ...input, specialtyFlavor: true })
  ).receiptId!;
  const photo = await media.upload(actor, {
    receiptId: receipt,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes(),
  });
  await service.finalize(actor, receipt, { ...input, specialtyFlavor: true });
  const full = (await staged.attachments(receipt))[0]!.derivatives[0]!.key;
  expect(
    await mayDeleteCommunityObject(env.DB, full, clock.now + DAY * 2),
  ).toBe(false);
  const stagedReceipt = (
    await service.preflight(actor, id(), {
      ...input,
      name: "Other recovery product",
    })
  ).receiptId!;
  const blob = await staged.reserve({
      userId: actor.id,
      submissionId: stagedReceipt,
      slot: "front",
      key: id(),
      hash: id(),
      profile: "standard-v1",
      bytes: 1,
      blobId: id(),
      imageId: id(),
      now: clock.now,
    }),
    attempt = id();
  expect(await staged.claim(blob, actor.id, attempt, clock.now)).toBe(true);
  const lateKey = `tmp/submissions/${attempt}/full.webp`;
  clock.now += LEASE + 1;
  await recoverCommunity(env.DB, env.MEDIA_BUCKET, clock.now);
  await storage.put(lateKey, bytes(), "image/webp");
  expect(
    await staged.complete(
      blob.id,
      attempt,
      [{ kind: "full", key: lateKey, width: 1, height: 1 }],
      clock.now,
    ),
  ).toBe(false);
  expect(await mayDeleteCommunityObject(env.DB, lateKey, clock.now)).toBe(true);
  clock.now += 31 * DAY;
  await recoverCommunity(env.DB, env.MEDIA_BUCKET, clock.now);
  expect(
    await env.DB.prepare("SELECT state FROM submission_receipts WHERE id=?")
      .bind(receipt)
      .first("state"),
  ).toBe("expired");
  await expect(
    media.read(actor, receipt, photo.imageId, "full"),
  ).rejects.toMatchObject({ status: 404 });
});
it("recovers interrupted canonical promotion without deleting a retry's published or historical evidence", async () => {
  const { actor, service, input, media, storage, receipts, clock } =
    await setup();
  const receiptId = (await service.preflight(actor, id(), input)).receiptId!,
    receipt = (await receipts.get(receiptId))!;
  await media.upload(actor, {
    receiptId,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes(),
  });
  const put = storage.put.bind(storage);
  let fail = true;
  vi.spyOn(storage, "put").mockImplementation(
    async (key, data, type, published) => {
      await put(key, data, type, published);
      if (published && fail) {
        fail = false;
        throw new Error("Interrupted promotion");
      }
    },
  );
  await expect(service.finalize(actor, receiptId, input)).rejects.toThrow(
    "Interrupted promotion",
  );
  expect(
    await env.DB.prepare("SELECT id FROM products WHERE id=?")
      .bind(receipt.planned_product_id)
      .first(),
  ).toBeNull();
  const old = (
    await env.DB.prepare(
      "SELECT object_key FROM media_promotions WHERE submission_id=?",
    )
      .bind(receiptId)
      .all<{ object_key: string }>()
  ).results.map((r) => r.object_key);
  const published = await service.finalize(actor, receiptId, input);
  expect(published.decision).toBe("READY");
  const image = await env.DB.prepare(
    "SELECT id,full_r2_key FROM product_images WHERE product_version_id=?",
  )
    .bind(receipt.planned_version_id)
    .first<{ id: string; full_r2_key: string }>();
  expect(old).not.toContain(image!.full_r2_key);
  for (const key of old)
    expect(await mayDeleteCommunityObject(env.DB, key, clock.now)).toBe(true);
  expect(
    await mayDeleteCommunityObject(env.DB, image!.full_r2_key, clock.now),
  ).toBe(false);
  await env.DB.prepare("UPDATE product_images SET state='archived' WHERE id=?")
    .bind(image!.id)
    .run();
  expect(
    await mayDeleteCommunityObject(
      env.DB,
      image!.full_r2_key,
      clock.now + 32 * DAY,
    ),
  ).toBe(false);
  expect(
    (
      await readMedia(
        env.DB,
        env.MEDIA_BUCKET,
        image!.id,
        "full",
        new Request("https://example.com/media"),
      )
    ).status,
  ).toBe(200);
});
it("publishes one canonical identity when two contributors finalize the same product concurrently", async () => {
  const { actor, f, service, input, media, receipts } = await setup(),
    other = { ...f.users[1]!, administrator: false };
  const a = (await service.preflight(actor, id(), input)).receiptId!,
    b = (await service.preflight(other, id(), input)).receiptId!;
  await media.upload(actor, {
    receiptId: a,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes(),
  });
  await media.upload(other, {
    receiptId: b,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes(),
  });
  const results = await Promise.allSettled([
    service.finalize(actor, a, input),
    service.finalize(other, b, input),
  ]);
  expect(
    results.filter(
      (r) => r.status === "fulfilled" && r.value.decision === "READY",
    ),
  ).toHaveLength(1);
  const ids = [
    (await receipts.get(a))!.planned_product_id,
    (await receipts.get(b))!.planned_product_id,
  ];
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM products WHERE id IN (?,?)")
      .bind(...ids)
      .first("n"),
  ).toBe(1);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});

it("reuses published content after cleanup and charges staged bytes across new receipt keys", async () => {
  const { actor, service, input, media, transformer, clock } = await setup({
    accountBytes: bytes().length * 2,
  });
  const transform = vi.spyOn(transformer, "transform");
  const a = (await service.preflight(actor, id(), input)).receiptId!;
  await media.upload(actor, {
    receiptId: a,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes(),
  });
  await service.finalize(actor, a, input);
  await recoverCommunity(env.DB, env.MEDIA_BUCKET, clock.now);
  const b = (
    await service.preflight(actor, id(), {
      ...input,
      name: "Second distinct flavor",
    })
  ).receiptId!;
  await media.upload(actor, {
    receiptId: b,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes(),
  });
  expect(transform).toHaveBeenCalledTimes(2);
  const c = (
    await service.preflight(actor, id(), {
      ...input,
      name: "Third distinct flavor",
    })
  ).receiptId!;
  await expect(
    media.upload(actor, {
      receiptId: c,
      slot: "front",
      idempotencyKey: id(),
      bytes: bytes(),
    }),
  ).rejects.toMatchObject({ code: "UPLOAD_LIMIT_OR_CONFLICT" });
  await media.upload(actor, {
    receiptId: b,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes(),
  });
  expect(transform).toHaveBeenCalledTimes(2);
});
it("enforces five daily submissions atomically while idempotent retries keep their receipt", async () => {
  const { actor, service, input } = await setup(),
    key = id();
  const first = await service.preflight(actor, key, input);
  const attempts = await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) =>
      service.preflight(actor, id(), { ...input, name: `Quota flavor ${i}` }),
    ),
  );
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(4);
  expect(await service.preflight(actor, key, input)).toMatchObject({
    receiptId: first.receiptId,
  });
});

it("shares the environment processing ceiling with legacy uploads and fences exhausted hash retries", async () => {
  const { actor, f, service, input, staged, clock } = await setup();
  clock.now += DAY * 2;
  const receipt = (await service.preflight(actor, id(), input)).receiptId!;
  const reserve = (slot: "front" | "back") =>
    staged.reserve({
      userId: actor.id,
      submissionId: receipt,
      slot,
      key: id(),
      hash: id(),
      profile: "standard-v1",
      bytes: 1,
      blobId: id(),
      imageId: id(),
      now: clock.now,
    });
  const first = await reserve("front");
  expect(await staged.claim(first, actor.id, id(), clock.now)).toBe(true);
  const legacyId = id();
  await env.DB.prepare(
    "INSERT INTO media_uploads(id,user_id,idempotency_key,product_version_id,slot,content_hash,created_at,updated_at) VALUES(?,?,?,?,'front',?,?,?)",
  )
    .bind(legacyId, actor.id, id(), f.versionId, id(), clock.now, clock.now)
    .run();
  await env.DB.batch(
    Array.from({ length: 49 }, () =>
      env.DB.prepare(
        "INSERT INTO media_attempts(id,upload_id,state,lease_expires_at,created_at) VALUES(?,?,'abandoned',?,?)",
      ).bind(id(), legacyId, clock.now, clock.now),
    ),
  );
  const second = await reserve("back");
  expect(await staged.claim(second, actor.id, id(), clock.now)).toBe(false);
  const { D1MediaRepository } =
    await import("../../server/media/infrastructure/d1-repository");
  const legacy = new D1MediaRepository(env.DB),
    record = await legacy.reserve(
      {
        userId: actor.id,
        idempotencyKey: id(),
        productVersionId: f.versionId,
        slot: "back",
        contentHash: id(),
      },
      id(),
      clock.now,
    );
  expect(await legacy.claim(record.id, id(), clock.now)).toBeNull();
  clock.now += DAY;
  for (let i = 0; i < 3; i++) {
    const attempt = id();
    expect(await staged.claim(second, actor.id, attempt, clock.now)).toBe(true);
    await staged.fail(second.id, attempt, clock.now);
  }
  expect(await staged.claim(second, actor.id, id(), clock.now)).toBe(false);
});

it("pauses a processing key only after repeated same-day failures and caps one account's daily share", async () => {
  const { actor, service, input, staged, clock } = await setup({
    accountProcessingPerDay: 5,
  });
  // Start on a day the shared environment budget has not been used by other tests.
  clock.now += DAY * 10;
  const receipt = (await service.preflight(actor, id(), input)).receiptId!;
  const reserve = (slot: "front" | "back" | "nutrition") =>
    staged.reserve({
      userId: actor.id,
      submissionId: receipt,
      slot,
      key: id(),
      hash: id(),
      profile: "standard-v1",
      bytes: 1,
      blobId: id(),
      imageId: id(),
      now: clock.now,
    });
  const [a, b, c] = [
    await reserve("front"),
    await reserve("back"),
    await reserve("nutrition"),
  ];
  // A successful attempt never counts: expired staging can be reprocessed.
  const done = id();
  expect(await staged.claim(a, actor.id, done, clock.now)).toBe(true);
  expect(await staged.complete(a.id, done, [], clock.now)).toBe(true);
  await env.DB.prepare("UPDATE staged_blobs SET state='expired' WHERE id=?")
    .bind(a.id)
    .run();
  for (let i = 0; i < 3; i++) {
    const attempt = id();
    expect(await staged.claim(a, actor.id, attempt, clock.now)).toBe(true);
    await staged.fail(a.id, attempt, clock.now);
  }
  expect(await staged.claim(a, actor.id, id(), clock.now)).toBe(false);
  const other = id();
  expect(await staged.claim(b, actor.id, other, clock.now)).toBe(true);
  await staged.fail(b.id, other, clock.now);
  // Five attempts today: this account's share is spent, not the environment's.
  expect(await staged.claim(c, actor.id, id(), clock.now)).toBe(false);
  clock.now += DAY;
  expect(await staged.claim(a, actor.id, id(), clock.now)).toBe(true);
});

it("limits evidence receipts separately from new submissions", async () => {
  const { actor, f, service, input } = await setup({ evidencePerDay: 1 });
  await service.evidenceReceipt(actor, id(), f.productId);
  await expect(
    service.evidenceReceipt(actor, id(), f.productId),
  ).rejects.toMatchObject({ code: "SUBMISSION_LIMIT" });
  expect((await service.preflight(actor, id(), input)).receiptId).toBeTruthy();
});
