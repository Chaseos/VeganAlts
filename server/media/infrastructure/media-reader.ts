import type { DerivativeKind } from "../domain/media";

const columns = {
  full: "full_r2_key",
  thumbnail: "thumbnail_r2_key",
  evidence: "evidence_r2_key",
} as const;
export function readMedia(
  db: D1Database,
  bucket: R2Bucket,
  imageId: string,
  variant: string,
  request: Request,
) {
  return readStoredMedia(db, bucket, imageId, variant, request, false);
}
export function readModeratedMedia(
  db: D1Database,
  bucket: R2Bucket,
  imageId: string,
  variant: string,
  request: Request,
) {
  return readStoredMedia(db, bucket, imageId, variant, request, true);
}
async function readStoredMedia(
  db: D1Database,
  bucket: R2Bucket,
  imageId: string,
  variant: string,
  request: Request,
  operator: boolean,
) {
  if (
    !Object.hasOwn(columns, variant) ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(imageId)
  )
    return new Response("Not found", { status: 404 });
  const column = columns[variant as DerivativeKind];
  // Archived means a previously accepted image was replaced. Its immutable URL
  // keeps working and recovery retains its objects. Rejected/pending bytes stay private.
  const row = await db
    .prepare(
      `SELECT i.${column} AS objectKey FROM product_images i JOIN product_versions v ON v.id=i.product_version_id JOIN products p ON p.id=v.product_id WHERE i.id=? ${operator ? "" : "AND i.state IN ('accepted','archived') AND p.lifecycle_status<>'hidden'"}`,
    )
    .bind(imageId)
    .first<{ objectKey: string | null }>();
  if (!row?.objectKey) return new Response("Not found", { status: 404 });
  const object = await bucket.get(row.objectKey, { onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": "image/webp",
    "Cache-Control": operator ? "private, no-store" : "public, max-age=0",
    ETag: object.httpEtag,
    "X-Content-Type-Options": "nosniff",
  });
  return new Response(
    "body" in object && request.method !== "HEAD" ? object.body : null,
    { status: "body" in object ? 200 : 304, headers },
  );
}

export async function adminFormulaOptions(db: D1Database) {
  const { results } = await db
    .prepare(
      "SELECT v.id,p.name,b.name AS brand,p.development_only AS developmentOnly FROM product_versions v JOIN products p ON p.id=v.product_id LEFT JOIN brands b ON b.id=p.brand_id WHERE v.is_current=1 AND p.lifecycle_status='active' ORDER BY b.name,p.name LIMIT 200",
    )
    .all<{
      id: string;
      name: string;
      brand: string | null;
      developmentOnly: number;
    }>();
  return results;
}
