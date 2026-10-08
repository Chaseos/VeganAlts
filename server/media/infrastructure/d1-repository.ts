import { ApplicationError } from "../../shared/domain/errors";
import type {
  MediaRepository,
  StoredDerivative,
  UploadAttempt,
  UploadInput,
  UploadRecord,
} from "../domain/media";

const LEASE_MS = 5 * 60_000;
const DAY_MS = 86_400_000;
// Per-environment ceilings include failed attempts and every retry. At most three
// transformations per attempt; this is an application safeguard, not a billing cap.
const DAILY_ATTEMPTS = 50;
const RETRIES = 3;

export class D1MediaRepository implements MediaRepository {
  constructor(private readonly db: D1Database) {}
  async reserve(
    input: UploadInput,
    id: string,
    now: number,
  ): Promise<UploadRecord> {
    const version = await this.db
      .prepare(
        "SELECT v.id FROM product_versions v JOIN products p ON p.id=v.product_id WHERE v.id=? AND p.lifecycle_status<>'hidden'",
      )
      .bind(input.productVersionId)
      .first();
    if (!version)
      throw new ApplicationError("NOT_FOUND", "Formula not found.", 404);
    await this.db
      .prepare(
        "INSERT INTO media_uploads(id,user_id,idempotency_key,product_version_id,slot,content_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id,idempotency_key) DO NOTHING",
      )
      .bind(
        id,
        input.userId,
        input.idempotencyKey,
        input.productVersionId,
        input.slot,
        input.contentHash,
        now,
        now,
      )
      .run();
    const row = await this.db
      .prepare(
        "SELECT id,user_id AS userId,idempotency_key AS idempotencyKey,product_version_id AS productVersionId,slot,content_hash AS contentHash,state,image_id AS imageId FROM media_uploads WHERE user_id=? AND idempotency_key=?",
      )
      .bind(input.userId, input.idempotencyKey)
      .first<UploadRecord>();
    if (!row) throw new Error("Upload reservation was not persisted.");
    return row;
  }

  async claim(
    uploadId: string,
    attemptId: string,
    now: number,
  ): Promise<UploadAttempt | null> {
    const results = await this.db.batch([
      this.db
        .prepare(
          "UPDATE media_uploads SET state='processing',active_attempt_id=?,failure_code=NULL,updated_at=? WHERE id=? AND state IN ('pending','failed') AND (SELECT COUNT(*) FROM media_attempts WHERE created_at>=?)+(SELECT COUNT(*) FROM staged_attempts WHERE created_at>=?) < ? AND (SELECT COUNT(*) FROM media_attempts WHERE upload_id=?) < ?",
        )
        .bind(
          attemptId,
          now,
          uploadId,
          Math.floor(now / DAY_MS) * DAY_MS,
          Math.floor(now / DAY_MS) * DAY_MS,
          DAILY_ATTEMPTS,
          uploadId,
          RETRIES,
        ),
      this.db
        .prepare(
          "INSERT INTO media_attempts(id,upload_id,state,lease_expires_at,created_at) SELECT ?,id,'processing',?,? FROM media_uploads WHERE id=? AND state='processing' AND active_attempt_id=?",
        )
        .bind(attemptId, now + LEASE_MS, now, uploadId, attemptId),
    ]);
    return results[0]!.meta.changes ? { id: attemptId, uploadId } : null;
  }

  async complete(
    upload: UploadRecord,
    attempt: UploadAttempt,
    imageId: string,
    derivatives: StoredDerivative[],
    now: number,
  ) {
    const full = derivatives.find((item) => item.kind === "full");
    const thumb = derivatives.find((item) => item.kind === "thumbnail");
    const evidence = derivatives.find((item) => item.kind === "evidence");
    if (
      !full ||
      !thumb ||
      ((upload.slot === "ingredients" || upload.slot === "nutrition") &&
        !evidence)
    )
      throw new Error("Missing required derivative.");
    const guard =
      "EXISTS (SELECT 1 FROM media_uploads WHERE id=? AND state='complete' AND active_attempt_id=? AND image_id=?)";
    const fence = [upload.id, attempt.id, imageId];
    const results = await this.db.batch([
      this.db
        .prepare(
          "UPDATE media_uploads SET state='complete',image_id=?,updated_at=? WHERE id=? AND state='processing' AND active_attempt_id=? AND EXISTS (SELECT 1 FROM media_attempts WHERE id=? AND state='processing' AND lease_expires_at>?) AND EXISTS(SELECT 1 FROM product_versions v JOIN products p ON p.id=v.product_id WHERE v.id=media_uploads.product_version_id AND p.lifecycle_status<>'hidden')",
        )
        .bind(imageId, now, upload.id, attempt.id, attempt.id, now),
      this.db
        .prepare(
          `UPDATE product_images SET state='archived',updated_at=? WHERE product_version_id=? AND slot=? AND state='accepted' AND ${guard}`,
        )
        .bind(now, upload.productVersionId, upload.slot, ...fence),
      this.db
        .prepare(
          `INSERT INTO product_images(id,product_version_id,slot,state,full_r2_key,thumbnail_r2_key,evidence_r2_key,full_width,full_height,evidence_width,evidence_height,mime_type,submitted_by,created_at,updated_at) SELECT ?,?,?,'accepted',?,?,?,?,?,?,?,'image/webp',?,?,? WHERE ${guard}`,
        )
        .bind(
          imageId,
          upload.productVersionId,
          upload.slot,
          full.key,
          thumb.key,
          evidence?.key ?? null,
          full.width,
          full.height,
          evidence?.width ?? null,
          evidence?.height ?? null,
          upload.userId,
          now,
          now,
          ...fence,
        ),
      this.db
        .prepare(
          `UPDATE media_attempts SET state='committed' WHERE id=? AND ${guard}`,
        )
        .bind(attempt.id, ...fence),
    ]);
    return results[0]!.meta.changes === 1;
  }

  async fail(attempt: UploadAttempt, code: string, now: number) {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE media_uploads SET state='failed',failure_code=?,updated_at=? WHERE id=? AND state='processing' AND active_attempt_id=?",
        )
        .bind(code, now, attempt.uploadId, attempt.id),
      this.db
        .prepare(
          "UPDATE media_attempts SET state='abandoned' WHERE id=? AND state='processing'",
        )
        .bind(attempt.id),
    ]);
  }
  async recoverExpired(now: number) {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE media_uploads SET state='failed',failure_code='INTERRUPTED',updated_at=? WHERE id IN(SELECT id FROM media_uploads WHERE (state='processing' AND active_attempt_id IN (SELECT id FROM media_attempts WHERE state='abandoned' OR (state='processing' AND lease_expires_at<=?))) OR (state='pending' AND updated_at<=?) ORDER BY updated_at,id LIMIT 100)",
        )
        .bind(now, now, now - LEASE_MS),
      this.db
        .prepare(
          "UPDATE media_attempts SET state='abandoned' WHERE id IN(SELECT id FROM media_attempts WHERE state='processing' AND lease_expires_at<=? ORDER BY lease_expires_at,id LIMIT 100)",
        )
        .bind(now),
    ]);
  }
  async canDeleteObject(key: string, _now: number) {
    const match =
      /^uploads\/([a-zA-Z0-9_-]+)\/(original|full\.webp|thumbnail\.webp|evidence\.webp)$/.exec(
        key,
      );
    if (!match) return false;
    // Referenced bytes survive even if operational state is inconsistent or the
    // accepted image has subsequently been archived by a replacement.
    const referenced = await this.db
      .prepare(
        "SELECT 1 FROM product_images WHERE full_r2_key=? OR thumbnail_r2_key=? OR evidence_r2_key=? LIMIT 1",
      )
      .bind(key, key, key)
      .first();
    if (referenced) return false;
    const attempt = await this.db
      .prepare("SELECT state FROM media_attempts WHERE id=?")
      .bind(match[1])
      .first<{ state: string }>();
    return (
      attempt?.state === "abandoned" ||
      (attempt?.state === "committed" && match[2] === "original")
    );
  }
  async recoveryCursor() {
    return (
      (await this.db
        .prepare(
          "SELECT cursor FROM community_recovery WHERE prefix='uploads/'",
        )
        .first<string>("cursor")) ?? undefined
    );
  }
  async saveRecoveryCursor(cursor: string | undefined) {
    await this.db
      .prepare(
        "INSERT INTO community_recovery(prefix,cursor) VALUES('uploads/',?) ON CONFLICT(prefix) DO UPDATE SET cursor=excluded.cursor",
      )
      .bind(cursor ?? null)
      .run();
  }
}
