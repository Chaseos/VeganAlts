import { matchBrands, nameMatch } from "../domain/brand-match";
import type { BrandRow } from "../domain/contracts";

const BRAND_LIMIT = 5000;
// The products a brand counts in a country: what search and pages show.
const COUNTED = "p.lifecycle_status IN ('active','under_review')";

/**
 * Brands matching typed text through the shared matcher (milestone 7), for
 * search, instant answers and Add a product alike. Names and aliases are read
 * in one pass and products are counted only for the brands that match, so a
 * lookup never counts the whole catalog. `everyBrand` includes brands with
 * nothing in the country yet.
 */
export async function matchingBrands(
  db: D1Database,
  countryId: string,
  query: string,
  limit: number,
  { everyBrand = false }: { everyBrand?: boolean } = {},
): Promise<BrandRow[]> {
  if (query.trim().length < 2) return [];
  const rows = await db
    .prepare(
      `SELECT b.id,b.slug,b.name,COALESCE(a.aliases,'[]') AS aliases FROM brands b
      LEFT JOIN (SELECT brand_id,json_group_array(alias) AS aliases FROM brand_aliases GROUP BY brand_id) a ON a.brand_id=b.id
      WHERE ?2 OR EXISTS(SELECT 1 FROM products p WHERE p.brand_id=b.id AND p.country_id=?1 AND ${COUNTED})
      ORDER BY b.name LIMIT ${BRAND_LIMIT}`,
    )
    .bind(countryId, everyBrand ? 1 : 0)
    .all<{ id: string; slug: string; name: string; aliases: string }>();
  const named = rows.results.flatMap((row) => {
    const aliases = JSON.parse(row.aliases) as string[];
    return [row.name, ...aliases].some(
      (name) => nameMatch(query, name) !== null,
    )
      ? [{ ...row, aliases }]
      : [];
  });
  if (!named.length) return [];
  const counts = await db
    .prepare(
      `SELECT p.brand_id AS id,COUNT(*) AS count FROM products p
      WHERE p.country_id=? AND ${COUNTED} AND p.brand_id IN (SELECT value FROM json_each(?)) GROUP BY p.brand_id`,
    )
    .bind(countryId, JSON.stringify(named.map((brand) => brand.id)))
    .all<{ id: string; count: number }>();
  const count = new Map(counts.results.map((row) => [row.id, row.count]));
  return matchBrands(
    query,
    named.map((brand) => ({
      ...brand,
      productCount: count.get(brand.id) ?? 0,
    })),
    limit,
  );
}
