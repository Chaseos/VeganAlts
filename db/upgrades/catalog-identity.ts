import {
  identityKey,
  normalizeName,
} from "../../server/community/domain/policy";

/**
 * Run after migrations. Immutable migration 0006 approximated the TypeScript
 * normalization in SQL (ASCII-only lower(), no NFKC, no package sizes), so
 * legacy brand, retailer and product identity keys could never match new
 * submissions. Recompute them with the application rules. Idempotent and
 * resumable; a name whose corrected key already belongs to another record is
 * left unchanged and counted for manual consolidation.
 */
export async function normalizeCatalogIdentity(db: D1Database) {
  const schema = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='product_identity_keys'",
    )
    .first();
  if (!schema) return { names: 0, keys: 0, conflicts: 0 };
  let names = 0,
    keys = 0,
    conflicts = 0;
  for (const [table, column] of [
    ["brands", "name"],
    ["retailers", "canonical_name"],
  ] as const) {
    let cursor = "";
    for (;;) {
      const page = await db
        .prepare(
          `SELECT id,${column} AS name,normalized_name FROM ${table} WHERE id>? ORDER BY id LIMIT 100`,
        )
        .bind(cursor)
        .all<{ id: string; name: string; normalized_name: string | null }>();
      if (!page.results.length) break;
      cursor = page.results.at(-1)!.id;
      const stale = page.results.filter(
        (row) => normalizeName(row.name) !== row.normalized_name,
      );
      if (!stale.length) continue;
      const results = await db.batch(
        stale.map((row) =>
          db
            .prepare(
              `UPDATE ${table} SET normalized_name=? WHERE id=? AND NOT EXISTS(SELECT 1 FROM ${table} WHERE normalized_name=? AND id<>?)`,
            )
            .bind(
              normalizeName(row.name),
              row.id,
              normalizeName(row.name),
              row.id,
            ),
        ),
      );
      const changed = results.filter((r) => r.meta.changes).length;
      names += changed;
      conflicts += stale.length - changed;
    }
  }
  // The earliest product keeps a shared key, matching the original backfill.
  let point: [number, string] = [Number.MIN_SAFE_INTEGER, ""];
  for (;;) {
    const page = await db
      .prepare(
        `SELECT p.id,p.country_id AS countryId,p.name,b.name AS brand,p.created_at AS createdAt FROM products p LEFT JOIN brands b ON b.id=p.brand_id
        WHERE (p.created_at,p.id)>(?,?) ORDER BY p.created_at,p.id LIMIT 100`,
      )
      .bind(...point)
      .all<{
        id: string;
        countryId: string;
        name: string;
        brand: string | null;
        createdAt: number;
      }>();
    if (!page.results.length) break;
    const last = page.results.at(-1)!;
    point = [last.createdAt, last.id];
    const statements = page.results.flatMap((product) => {
      const key = identityKey(
        product.countryId,
        product.brand ?? "",
        product.name,
      );
      return [
        db
          .prepare(
            "INSERT INTO product_identity_keys(identity_key,product_id) VALUES(?,?) ON CONFLICT DO NOTHING",
          )
          .bind(key, product.id),
        // Retire approximate keys only once the product owns its corrected key.
        db
          .prepare(
            "DELETE FROM product_identity_keys WHERE product_id=? AND identity_key<>? AND EXISTS(SELECT 1 FROM product_identity_keys WHERE identity_key=? AND product_id=?)",
          )
          .bind(product.id, key, key, product.id),
      ];
    });
    const results = await db.batch(statements);
    keys += results.filter((r, i) => i % 2 === 0 && r.meta.changes).length;
  }
  return { names, keys, conflicts };
}
