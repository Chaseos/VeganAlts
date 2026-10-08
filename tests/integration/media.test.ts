import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { catalogFixture } from "./fixtures";
import { UploadService } from "../../server/media/application/upload-service";
import { MediaRecoveryService } from "../../server/media/application/recovery-service";
import { CloudflareImageTransformer } from "../../server/media/infrastructure/cloudflare-images";
import { D1MediaRepository } from "../../server/media/infrastructure/d1-repository";
import { R2MediaStorage } from "../../server/media/infrastructure/r2-storage";
import { readMedia } from "../../server/media/infrastructure/media-reader";
import {
  attemptKey,
  MAX_UPLOAD_BYTES,
  type StoredDerivative,
} from "../../server/media/domain/media";
import { limitedFormData } from "../../server/shared/http/limited-form";

const bytes = (format: "png" | "jpeg" | "webp") =>
  Uint8Array.from(atob(env.TEST_IMAGES[format]), (char) => char.charCodeAt(0));
const id = () => crypto.randomUUID();

it("decodes and stores evidence derivatives once, serves R2 bytes, and never enlarges small images", async () => {
  const fixture = await catalogFixture(env.DB, 1);
  const repository = new D1MediaRepository(env.DB),
    storage = new R2MediaStorage(env.MEDIA_BUCKET),
    transformer = new CloudflareImageTransformer(env.IMAGES);
  const transform = vi.spyOn(transformer, "transform");
  const service = new UploadService(repository, storage, transformer, id);
  const input = {
    userId: fixture.users[0]!.id,
    productVersionId: fixture.versionId,
    slot: "ingredients" as const,
    idempotencyKey: id(),
    bytes: bytes("png"),
  };
  const result = await service.upload(input);
  expect(await service.upload(input)).toEqual(result);
  expect(transform).toHaveBeenCalledTimes(3);
  const row = await env.DB.prepare("SELECT * FROM product_images WHERE id=?")
    .bind(result.imageId)
    .first();
  expect(row).toMatchObject({
    state: "accepted",
    full_width: 1800,
    full_height: 1350,
    evidence_width: 2400,
    evidence_height: 1800,
  });
  const response = await readMedia(
    env.DB,
    env.MEDIA_BUCKET,
    result.imageId!,
    "evidence",
    new Request("https://example.invalid/media"),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=0");
  const decoded = await transformer.inspect(
    new Uint8Array(await response.arrayBuffer()),
  );
  expect(decoded).toMatchObject({
    format: "image/webp",
    width: 2400,
    height: 1800,
  });
  const cached = await readMedia(
    env.DB,
    env.MEDIA_BUCKET,
    result.imageId!,
    "evidence",
    new Request("https://example.invalid/media", {
      headers: { "If-None-Match": response.headers.get("ETag")! },
    }),
  );
  expect(cached.status).toBe(304);
  expect(transform).toHaveBeenCalledTimes(3);
  const small = await service.upload({
    ...input,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes("jpeg"),
  });
  expect(
    await env.DB.prepare(
      "SELECT full_width,full_height,evidence_r2_key FROM product_images WHERE id=?",
    )
      .bind(small.imageId)
      .first(),
  ).toEqual({ full_width: 300, full_height: 225, evidence_r2_key: null });
  await service.upload({
    ...input,
    slot: "back",
    idempotencyKey: id(),
    bytes: bytes("webp"),
  });
  await expect(
    service.upload({ ...input, bytes: bytes("jpeg") }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  expect(
    (
      await readMedia(
        env.DB,
        env.MEDIA_BUCKET,
        result.imageId!,
        "toString",
        new Request("https://example.invalid"),
      )
    ).status,
  ).toBe(404);
});

it("cleans partial failures, fences expired attempts and late writes, and preserves committed replacements", async () => {
  const fixture = await catalogFixture(env.DB, 1);
  const repository = new D1MediaRepository(env.DB),
    storage = new R2MediaStorage(env.MEDIA_BUCKET),
    transformer = new CloudflareImageTransformer(env.IMAGES);
  let now = Date.now();
  const service = new UploadService(
    repository,
    storage,
    transformer,
    id,
    () => now,
  );
  const recovery = new MediaRecoveryService(repository, storage, () => now);
  const input = {
    userId: fixture.users[0]!.id,
    productVersionId: fixture.versionId,
    slot: "front" as const,
    idempotencyKey: id(),
    bytes: bytes("jpeg"),
  };
  const original = await service.upload(input);
  const originalKey = await env.DB.prepare(
    "SELECT full_r2_key FROM product_images WHERE id=?",
  )
    .bind(original.imageId)
    .first<string>("full_r2_key");
  const realTransform = transformer.transform.bind(transformer);
  let calls = 0;
  const fail = vi
    .spyOn(transformer, "transform")
    .mockImplementation(async (...args) => {
      if (++calls === 2) throw new Error("Injected partial failure");
      return realTransform(...args);
    });
  const retry = { ...input, idempotencyKey: id() };
  await expect(service.upload(retry)).rejects.toMatchObject({
    code: "PROCESSING_FAILED",
  });
  const failed = await env.DB.prepare(
    "SELECT active_attempt_id FROM media_uploads WHERE user_id=? AND idempotency_key=?",
  )
    .bind(input.userId, retry.idempotencyKey)
    .first<string>("active_attempt_id");
  expect(await env.MEDIA_BUCKET.get(attemptKey(failed!, "full"))).toBeNull();
  expect(await env.MEDIA_BUCKET.get(originalKey!)).not.toBeNull();
  fail.mockRestore();
  const replacement = await service.upload(retry);
  expect(replacement.imageId).not.toBe(original.imageId);
  expect(
    await env.DB.prepare("SELECT state FROM product_images WHERE id=?")
      .bind(original.imageId)
      .first("state"),
  ).toBe("archived");
  const interrupted = await repository.reserve(
    { ...input, idempotencyKey: id(), contentHash: "interrupted-test" },
    id(),
    now,
  );
  const attempt = (await repository.claim(interrupted.id, id(), now))!;
  await storage.put(
    attemptKey(attempt.id, "original"),
    bytes("jpeg"),
    "image/jpeg",
  );
  await storage.put(
    attemptKey(attempt.id, "full"),
    bytes("webp"),
    "image/webp",
  );
  now += 6 * 60_000;
  await recovery.recover();
  expect(
    await env.MEDIA_BUCKET.get(attemptKey(attempt.id, "original")),
  ).toBeNull();
  const outputs: StoredDerivative[] = [
    {
      kind: "full",
      key: attemptKey(attempt.id, "full"),
      width: 300,
      height: 225,
    },
    {
      kind: "thumbnail",
      key: attemptKey(attempt.id, "thumbnail"),
      width: 300,
      height: 225,
    },
  ];
  expect(
    await repository.complete(interrupted, attempt, id(), outputs, now),
  ).toBe(false);
  await storage.put(
    attemptKey(attempt.id, "thumbnail"),
    bytes("webp"),
    "image/webp",
  );
  await recovery.recover();
  expect(
    await env.MEDIA_BUCKET.get(attemptKey(attempt.id, "thumbnail")),
  ).toBeNull();
  expect(await env.MEDIA_BUCKET.get(originalKey!)).not.toBeNull();
  expect(
    (
      await readMedia(
        env.DB,
        env.MEDIA_BUCKET,
        replacement.imageId!,
        "full",
        new Request("https://example.invalid"),
      )
    ).status,
  ).toBe(200);
});

it("rejects malformed, oversized and excessive-dimension uploads before committing media", async () => {
  const fixture = await catalogFixture(env.DB, 1);
  const transformer = new CloudflareImageTransformer(env.IMAGES);
  const service = new UploadService(
    new D1MediaRepository(env.DB),
    new R2MediaStorage(env.MEDIA_BUCKET),
    transformer,
    id,
  );
  const input = {
    userId: fixture.users[0]!.id,
    productVersionId: fixture.versionId,
    slot: "front" as const,
    idempotencyKey: id(),
    bytes: new Uint8Array([0xff, 0xd8, 0xff, 0]),
  };
  await expect(service.upload(input)).rejects.toMatchObject({
    code: "INVALID_IMAGE",
  });
  await expect(
    service.upload({ ...input, bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1) }),
  ).rejects.toMatchObject({ status: 413 });
  vi.spyOn(transformer, "inspect").mockResolvedValueOnce({
    format: "image/jpeg",
    width: 10000,
    height: 5000,
  });
  await expect(
    service.upload({ ...input, bytes: bytes("jpeg") }),
  ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE" });
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(200));
      controller.close();
    },
  });
  await expect(
    limitedFormData(
      new Request("https://example.invalid", { method: "POST", body: stream }),
      100,
    ),
  ).rejects.toMatchObject({ status: 413 });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM product_images WHERE product_version_id=?",
    )
      .bind(fixture.versionId)
      .first("count"),
  ).toBe(0);
});

it("claims one attempt under concurrency and enforces retry and daily budgets atomically", async () => {
  const fixture = await catalogFixture(env.DB, 1);
  const repository = new D1MediaRepository(env.DB);
  const now = Date.parse("2030-01-01T12:00:00Z");
  const input = {
    userId: fixture.users[0]!.id,
    productVersionId: fixture.versionId,
    slot: "front" as const,
    idempotencyKey: id(),
    contentHash: "test",
  };
  const upload = await repository.reserve(input, id(), now);
  const claims = await Promise.all([
    repository.claim(upload.id, id(), now),
    repository.claim(upload.id, id(), now),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  await repository.fail(claims.find(Boolean)!, "TEST", now);
  for (let count = 0; count < 2; count++) {
    const attempt = await repository.claim(upload.id, id(), now);
    expect(attempt).not.toBeNull();
    await repository.fail(attempt!, "TEST", now);
  }
  expect(await repository.claim(upload.id, id(), now)).toBeNull();
  await env.DB.batch(
    Array.from({ length: 47 }, () =>
      env.DB.prepare(
        "INSERT INTO media_attempts(id,upload_id,state,lease_expires_at,created_at) VALUES (?,?,'abandoned',?,?)",
      ).bind(id(), upload.id, now, now),
    ),
  );
  const another = await repository.reserve(
    { ...input, idempotencyKey: id() },
    id(),
    now,
  );
  expect(await repository.claim(another.id, id(), now)).toBeNull();
  expect(
    await repository.claim(another.id, id(), now + 86_400_000),
  ).not.toBeNull();
});
