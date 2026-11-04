/** Resolve explicit references, including retired records, independently of picker limits. */
export async function catalogReferenceLabels(db: D1Database, ids: string[]) {
  if (!ids.length) return {} as Record<string, string>;
  const query = JSON.stringify([...new Set(ids)]);
  // D1 limits compound SELECT statements to five terms. Keep each record
  // type separate while resolving every explicit reference in one batch.
  const statements = [
    "SELECT id,name FROM categories WHERE id IN(SELECT value FROM json_each(?))",
    "SELECT id,canonical_name AS name FROM product_families WHERE id IN(SELECT value FROM json_each(?))",
    "SELECT p.id,COALESCE(b.name || ' · ','') || p.name || ' · ' || c.iso2 AS name FROM products p JOIN countries c ON c.id=p.country_id LEFT JOIN brands b ON b.id=p.brand_id WHERE p.id IN(SELECT value FROM json_each(?))",
    "SELECT id,canonical_name AS name FROM retailers WHERE id IN(SELECT value FROM json_each(?))",
    "SELECT id,COALESCE(version_label,'Formula') || ' (' || substr(id,-8) || ')' AS name FROM product_versions WHERE id IN(SELECT value FROM json_each(?))",
    "SELECT id,slot || ' photo (' || substr(id,-8) || ')' AS name FROM product_images WHERE id IN(SELECT value FROM json_each(?))",
  ];
  const rows = await db.batch<{ id: string; name: string }>(
    statements.map((sql) => db.prepare(sql).bind(query)),
  );
  return Object.fromEntries(
    rows.flatMap((result) => result.results.map((row) => [row.id, row.name])),
  );
}
