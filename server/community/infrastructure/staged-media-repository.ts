import { ApplicationError } from "../../shared/domain/errors";
import type { ImageSlot, StoredDerivative } from "../../media/domain/media";
import type { SubmissionReceipt } from "../domain/contracts";
import { DAY, LEASE, type CommunityLimits } from "../domain/policy";

export interface StagedBlob {
  id: string;
  user_id: string;
  state: string;
  active_attempt_id: string | null;
  derivatives: string | null;
  input_bytes: number;
}
export interface StagedAttachment {
  slot: ImageSlot;
  imageId: string;
  blobId: string;
  derivatives: StoredDerivative[];
  inputBytes: number;
  state: string;
  contentHash: string;
}
export class StagedMediaRepository {
  constructor(
    private readonly db: D1Database,
    private readonly limits: CommunityLimits,
  ) {}
  receipt(id: string) {
    return this.db
      .prepare("SELECT * FROM submission_receipts WHERE id=?")
      .bind(id)
      .first<SubmissionReceipt>();
  }
  async reserve(input: {
    userId: string;
    submissionId: string;
    slot: ImageSlot;
    key: string;
    hash: string;
    profile: string;
    bytes: number;
    blobId: string;
    imageId: string;
    now: number;
  }) {
    await this.db
      .prepare(
        "INSERT INTO staged_upload_keys(user_id,idempotency_key,submission_id,slot,content_hash) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
      )
      .bind(input.userId, input.key, input.submissionId, input.slot, input.hash)
      .run();
    const prior = await this.db
      .prepare(
        "SELECT submission_id,slot,content_hash FROM staged_upload_keys WHERE user_id=? AND idempotency_key=?",
      )
      .bind(input.userId, input.key)
      .first<{ submission_id: string; slot: string; content_hash: string }>();
    if (
      !prior ||
      prior.submission_id !== input.submissionId ||
      prior.slot !== input.slot ||
      prior.content_hash !== input.hash
    )
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "This upload key belongs to different content.",
        409,
      );
    await this.db
      .prepare(
        "INSERT INTO staged_blobs(id,user_id,content_hash,profile,input_bytes,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,content_hash,profile) DO NOTHING",
      )
      .bind(
        input.blobId,
        input.userId,
        input.hash,
        input.profile,
        input.bytes,
        input.now,
        input.now,
      )
      .run();
    const blob = await this.db
      .prepare(
        "SELECT * FROM staged_blobs WHERE user_id=? AND content_hash=? AND profile=?",
      )
      .bind(input.userId, input.hash, input.profile)
      .first<StagedBlob>();
    if (!blob) throw new Error("Upload reservation missing.");
    // Reserve slot bytes before processing, atomically with the count/byte check.
    const result = await this.db
      .prepare(
        `INSERT INTO submission_uploads(submission_id,slot,blob_id,image_id,created_at)
      SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM submission_receipts WHERE id=? AND user_id=? AND state='staging' AND expires_at>?)
      AND (SELECT COUNT(*) FROM submission_uploads WHERE submission_id=? AND slot<>?) < ?
      AND (SELECT COALESCE(SUM(b.input_bytes),0) FROM submission_uploads u JOIN staged_blobs b ON b.id=u.blob_id WHERE u.submission_id=? AND u.slot<>?)+? <= ?
      AND (SELECT COALESCE(SUM(b.input_bytes),0) FROM submission_uploads u JOIN staged_blobs b ON b.id=u.blob_id JOIN submission_receipts r ON r.id=u.submission_id WHERE r.user_id=? AND u.created_at>=? AND NOT(u.submission_id=? AND u.slot=?))+? <= ?
      ON CONFLICT(submission_id,slot) DO UPDATE SET blob_id=excluded.blob_id WHERE submission_uploads.blob_id=excluded.blob_id`,
      )
      .bind(
        input.submissionId,
        input.slot,
        blob.id,
        input.imageId,
        input.now,
        input.submissionId,
        input.userId,
        input.now,
        input.submissionId,
        input.slot,
        this.limits.images,
        input.submissionId,
        input.slot,
        input.bytes,
        this.limits.submissionBytes,
        input.userId,
        Math.floor(input.now / DAY) * DAY,
        input.submissionId,
        input.slot,
        input.bytes,
        this.limits.accountBytes,
      )
      .run();
    if (!result.meta.changes)
      throw new ApplicationError(
        "UPLOAD_LIMIT_OR_CONFLICT",
        "This photo slot is already reserved, or the submission/account has reached its image or daily byte allowance. Retry tomorrow for daily limits; use a fresh submission to change a reserved photo.",
        409,
      );
    return blob;
  }
  async claim(
    blob: StagedBlob,
    userId: string,
    attemptId: string,
    now: number,
  ) {
    const day = Math.floor(now / DAY) * DAY;
    const result = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO staged_attempts(id,blob_id,user_id,state,input_bytes,lease_expires_at,created_at)
        SELECT ?,id,?,'processing',input_bytes,?,? FROM staged_blobs WHERE id=? AND state IN ('pending','failed','expired')
        AND (SELECT COUNT(*) FROM staged_attempts WHERE created_at>=?)+(SELECT COUNT(*) FROM media_attempts WHERE created_at>=?) < ?
        AND (SELECT COUNT(*) FROM staged_attempts WHERE user_id=? AND created_at>=?) < ?
        AND (SELECT COUNT(*) FROM staged_attempts WHERE blob_id=? AND state<>'committed' AND created_at>=?) < ?
        AND (SELECT COUNT(*) FROM staged_attempts WHERE user_id=? AND state='processing' AND lease_expires_at>?) < ?
        AND (SELECT COALESCE(SUM(input_bytes),0) FROM staged_attempts WHERE user_id=? AND created_at>=?)+input_bytes <= ?`,
        )
        .bind(
          attemptId,
          userId,
          now + LEASE,
          now,
          blob.id,
          day,
          day,
          this.limits.processingPerDay,
          userId,
          day,
          this.limits.accountProcessingPerDay,
          // A successful attempt never counts: expired staging may be
          // reprocessed. Repeated failures pause the key until the next day.
          blob.id,
          day,
          this.limits.retries,
          userId,
          now,
          this.limits.concurrentUploads,
          userId,
          day,
          this.limits.accountBytes,
        ),
      this.db
        .prepare(
          "UPDATE staged_blobs SET state='processing',active_attempt_id=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM staged_attempts WHERE id=?)",
        )
        .bind(attemptId, now, blob.id, attemptId),
    ]);
    return result[0]!.meta.changes === 1;
  }
  async complete(
    blobId: string,
    attemptId: string,
    derivatives: StoredDerivative[],
    now: number,
  ) {
    const result = await this.db.batch([
      this.db
        .prepare(
          "UPDATE staged_blobs SET state='complete',derivatives=?,updated_at=? WHERE id=? AND state='processing' AND active_attempt_id=? AND EXISTS(SELECT 1 FROM staged_attempts WHERE id=? AND state='processing' AND lease_expires_at>?)",
        )
        .bind(
          JSON.stringify(derivatives),
          now,
          blobId,
          attemptId,
          attemptId,
          now,
        ),
      this.db
        .prepare(
          "UPDATE staged_attempts SET state='committed' WHERE id=? AND EXISTS(SELECT 1 FROM staged_blobs WHERE id=? AND state='complete' AND active_attempt_id=?)",
        )
        .bind(attemptId, blobId, attemptId),
    ]);
    return result[0]!.meta.changes === 1;
  }
  async fail(blobId: string, attemptId: string, now: number) {
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE staged_blobs SET state='failed',updated_at=? WHERE id=? AND state='processing' AND active_attempt_id=?",
        )
        .bind(now, blobId, attemptId),
      this.db
        .prepare(
          "UPDATE staged_attempts SET state='abandoned' WHERE id=? AND state='processing'",
        )
        .bind(attemptId),
    ]);
  }
  async attachments(receiptId: string): Promise<StagedAttachment[]> {
    const rows = await this.db
      .prepare(
        "SELECT u.slot,u.image_id AS imageId,u.blob_id AS blobId,b.derivatives,b.input_bytes AS inputBytes,b.state,b.content_hash AS contentHash FROM submission_uploads u JOIN staged_blobs b ON b.id=u.blob_id WHERE u.submission_id=? ORDER BY u.slot",
      )
      .bind(receiptId)
      .all<
        Omit<StagedAttachment, "derivatives"> & { derivatives: string | null }
      >();
    return rows.results.map((r) => ({
      ...r,
      derivatives: r.derivatives
        ? (JSON.parse(r.derivatives) as StoredDerivative[])
        : [],
    }));
  }
  async promotion(
    receiptId: string,
    imageId: string,
    derivatives: StoredDerivative[],
    token: string,
    now: number,
  ) {
    await this.db.batch(
      derivatives.map((d) =>
        this.db
          .prepare(
            "INSERT INTO media_promotions(object_key,image_id,submission_id,lease_token,created_at) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
          )
          .bind(d.key, imageId, receiptId, token, now),
      ),
    );
  }
}
