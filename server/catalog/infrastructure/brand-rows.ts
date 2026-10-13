import { matchBrands, nameMatch } from "../domain/brand-match";
import type { BrandRow } from "../domain/contracts";

// Lookups start at three letters or digits, the index's unit.
export const BRAND_LOOKUP_MIN = 3;
// The closest brands by shared trigrams, before the matcher orders them.
const CANDIDATES = 200;
const MAX_TRIGRAMS = 32;
// The products a brand counts in a country: what search and pages show.
const COUNTED = "p.lifecycle_status IN ('active','under_review')";

/**
 * The three-letter runs of the typed words and of the words run together
 * (so "beyondm" still finds "Beyond Meat"), each quoted for FTS5.
 */
function trigrams(query: string) {
  const words =
    query
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const runs = new Set<string>();
  for (const word of [...words, words.join("")]) {
    const letters = Array.from(word);
    for (let i = 0; i + 3 <= letters.length; i++)
      runs.add(letters.slice(i, i + 3).join(""));
  }
  return [...runs].slice(0, MAX_TRIGRAMS).map((run) => `"${run}"`);
}

/**
 * Brands matching typed text through the shared matcher (milestone 7), for
 * search, instant answers and Add a product alike. The trigram index
 * (`brand_search`) finds the brands sharing three letters in a row with the
 * text, so a lookup never reads every brand; the matcher then keeps and
 * orders the real matches, and products are counted only for those.
 * `everyBrand` includes brands with nothing in the country yet.
 */
export async function matchingBrands(
  db: D1Database,
  countryId: string,
  query: string,
  limit: number,
  { everyBrand = false }: { everyBrand?: boolean } = {},
): Promise<BrandRow[]> {
  const runs = trigrams(query);
  if (!runs.length) return [];
  const rows = await db
    .prepare(
      `SELECT b.id,b.slug,b.name,brand_search.aliases FROM brand_search JOIN brands b ON b.id=brand_search.brand_id
      WHERE brand_search MATCH ?3
        AND (?2 OR EXISTS(SELECT 1 FROM products p WHERE p.brand_id=b.id AND p.country_id=?1 AND ${COUNTED}))
      ORDER BY brand_search.rank LIMIT ${CANDIDATES}`,
    )
    .bind(countryId, everyBrand ? 1 : 0, runs.join(" OR "))
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
