// Bounded, durable scans keep cleanup independent of catalog traffic. Every pass
// checks live leases and canonical references, including late writes by an expired worker.
export async function recoverCommunity(
  db: D1Database,
  bucket: R2Bucket,
  now = Date.now(),
) {
  await db.batch([
    db
      .prepare(
        "UPDATE staged_attempts SET state='abandoned' WHERE id IN(SELECT id FROM staged_attempts WHERE state='processing' AND lease_expires_at<=? ORDER BY lease_expires_at,id LIMIT 100)",
      )
      .bind(now),
    db
      .prepare(
        "UPDATE staged_blobs SET state='failed',updated_at=? WHERE id IN(SELECT id FROM staged_blobs WHERE state='processing' AND active_attempt_id IN (SELECT id FROM staged_attempts WHERE state='abandoned') ORDER BY updated_at,id LIMIT 100)",
      )
      .bind(now),
    db
      .prepare(
        "UPDATE submission_receipts SET state=CASE WHEN EXISTS(SELECT 1 FROM pending_submissions p WHERE p.submission_id=submission_receipts.id) OR EXISTS(SELECT 1 FROM edit_proposals WHERE status='pending' AND json_extract(proposed_data,'$.evidenceReceiptId')=submission_receipts.id) THEN 'review' ELSE 'staging' END,active_token=NULL,lease_expires_at=NULL WHERE id IN(SELECT id FROM submission_receipts WHERE state='publishing' AND lease_expires_at<=? ORDER BY lease_expires_at,id LIMIT 100)",
      )
      .bind(now),
    db
      .prepare(
        "UPDATE submission_receipts SET state='expired',updated_at=? WHERE id IN(SELECT id FROM submission_receipts WHERE state IN ('staging','review') AND expires_at<=? ORDER BY expires_at,id LIMIT 100)",
      )
      .bind(now, now),
    db
      .prepare(
        "UPDATE pending_submissions SET resolution_note='The review window expired. Submit fresh evidence to continue.',resolved_at=?,revision=revision+1 WHERE submission_id IN(SELECT submission_id FROM pending_submissions WHERE resolved_at IS NULL AND submission_id IN (SELECT id FROM submission_receipts WHERE state='expired') ORDER BY submission_id LIMIT 100)",
      )
      .bind(now),
    db
      .prepare(
        "UPDATE edit_proposals SET status='rejected',resolution_note='Evidence expired after the review window. Submit a fresh proposal.',resolved_at=?,updated_at=? WHERE id IN(SELECT id FROM edit_proposals WHERE status='pending' AND json_extract(proposed_data,'$.evidenceReceiptId') IN(SELECT id FROM submission_receipts WHERE state='expired') ORDER BY updated_at,id LIMIT 100)",
      )
      .bind(now, now),
  ]);
  let removed = 0;
  for (const prefix of ["tmp/submissions/", "products/"]) {
    const cursor = await db
      .prepare("SELECT cursor FROM community_recovery WHERE prefix=?")
      .bind(prefix)
      .first<string>("cursor");
    const page = await bucket.list({
      prefix,
      limit: 100,
      cursor: cursor ?? undefined,
    });
    for (const object of page.objects) {
      if (await mayDeleteCommunityObject(db, object.key, now)) {
        await bucket.delete(object.key);
        removed++;
      }
    }
    await db
      .prepare(
        "INSERT INTO community_recovery(prefix,cursor) VALUES(?,?) ON CONFLICT(prefix) DO UPDATE SET cursor=excluded.cursor",
      )
      .bind(prefix, page.truncated ? page.cursor : null)
      .run();
  }
  return { removed };
}
export async function mayDeleteCommunityObject(
  db: D1Database,
  key: string,
  now: number,
) {
  const referenced = await db
    .prepare(
      "SELECT 1 FROM product_images WHERE full_r2_key=? OR thumbnail_r2_key=? OR evidence_r2_key=? LIMIT 1",
    )
    .bind(key, key, key)
    .first();
  if (referenced) return false;
  const temporary =
    /^tmp\/submissions\/([a-zA-Z0-9_-]+)\/(original|full\.webp|thumbnail\.webp|evidence\.webp)$/.exec(
      key,
    );
  if (temporary) {
    const attempt = await db
      .prepare(
        "SELECT blob_id,state,lease_expires_at FROM staged_attempts WHERE id=?",
      )
      .bind(temporary[1])
      .first<{ blob_id: string; state: string; lease_expires_at: number }>();
    if (
      !attempt ||
      (attempt.state === "processing" && attempt.lease_expires_at > now)
    )
      return false;
    if (attempt.state === "abandoned" || temporary[2] === "original")
      return true;
    // Published hashes reuse durable canonical derivatives. Their old temporary
    // objects are no longer processing inputs, even when another receipt uses the hash.
    const blobUsesKey = await db
      .prepare(
        "SELECT 1 FROM staged_blobs b,json_each(b.derivatives) d WHERE b.id=? AND b.active_attempt_id=? AND json_extract(d.value,'$.key')=? LIMIT 1",
      )
      .bind(attempt.blob_id, temporary[1], key)
      .first();
    if (!blobUsesKey) return true;
    const used = await db
      .prepare(
        `SELECT 1 FROM staged_blobs b JOIN submission_uploads u ON u.blob_id=b.id JOIN submission_receipts r ON r.id=u.submission_id
      WHERE b.id=? AND b.active_attempt_id=? AND r.state IN ('staging','review','publishing') AND r.expires_at>? LIMIT 1`,
      )
      .bind(attempt.blob_id, temporary[1], now)
      .first();
    if (used) return false;
    const expired = await db
      .prepare(
        "UPDATE staged_blobs SET state='expired',updated_at=? WHERE id=? AND active_attempt_id=? AND state='complete' AND NOT EXISTS(SELECT 1 FROM submission_uploads u JOIN submission_receipts r ON r.id=u.submission_id WHERE u.blob_id=staged_blobs.id AND r.state IN ('staging','review','publishing') AND r.expires_at>?)",
      )
      .bind(now, attempt.blob_id, temporary[1], now)
      .run();
    if (expired.meta.changes) return true;
    return Boolean(
      await db
        .prepare(
          "SELECT id FROM staged_blobs WHERE id=? AND (state='expired' OR active_attempt_id<>?)",
        )
        .bind(attempt.blob_id, temporary[1])
        .first(),
    );
  }
  const promotion = await db
    .prepare(
      "SELECT r.id,r.state,r.lease_expires_at,r.active_token,p.lease_token FROM media_promotions p JOIN submission_receipts r ON r.id=p.submission_id WHERE p.object_key=?",
    )
    .bind(key)
    .first<{
      id: string;
      state: string;
      lease_expires_at: number | null;
      active_token: string | null;
      lease_token: string;
    }>();
  if (!promotion) return false;
  if (
    promotion.state === "publishing" &&
    promotion.active_token === promotion.lease_token
  ) {
    if ((promotion.lease_expires_at ?? 0) > now) return false;
    // Revoke an expired publisher before deleting its private attempt keys.
    await db
      .prepare(
        "UPDATE submission_receipts SET state=CASE WHEN purpose='evidence' OR EXISTS(SELECT 1 FROM pending_submissions WHERE submission_id=submission_receipts.id) THEN 'review' ELSE 'staging' END,active_token=NULL,lease_expires_at=NULL WHERE id=? AND active_token=? AND lease_expires_at<=?",
      )
      .bind(promotion.id, promotion.lease_token, now)
      .run();
  }
  // A publication may have committed between the first reference check and the
  // lease read. The final reference check runs after that commit or revocation.
  return !(await db
    .prepare(
      "SELECT 1 FROM product_images WHERE full_r2_key=? OR thumbnail_r2_key=? OR evidence_r2_key=? LIMIT 1",
    )
    .bind(key, key, key)
    .first());
}
