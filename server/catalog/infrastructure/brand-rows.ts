import {
  nameMatch,
  brandPosition,
  compareBrandPositions,
} from "../domain/brand-match";
import type { BrandPosition } from "../domain/batches";
import type { BrandMatches } from "../domain/contracts";

// Lookups start at three letters or digits, the index's unit.
export const BRAND_LOOKUP_MIN = 3;
// The closest brands by shared trigrams, before the matcher orders them.
const CANDIDATES = 200;
const MAX_TRIGRAMS = 32;
// Brands sharing a typed word's first letter, for typos without a trigram.
const INITIAL_CANDIDATES = 2000;
// Typos are allowed from five letters (brand-match.ts).
const TYPO_LENGTH = 5;
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
 * The first letters of the typed text and of each typed word long enough
 * for typos, as `normalized_name` stores them (lower case, NFKC).
 */
function typoInitials(query: string) {
  const words =
    query
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  const typed = [words.join(""), ...words].filter(
    (word) => Array.from(word).length >= TYPO_LENGTH,
  );
  return [...new Set(typed.map((word) => Array.from(word)[0]!))];
}
const nextLetter = (letter: string) =>
  String.fromCodePoint(letter.codePointAt(0)! + 1);
// `normalized_name` from ?3 on: [letter, next letter) for each initial.
const initialRanges = (initials: string[]) =>
  initials
    .map(
      (_, i) =>
        `(normalized_name>=?${3 + 2 * i} AND normalized_name<?${4 + 2 * i})`,
    )
    .join(" OR ");

/**
 * Brands matching typed text through the shared matcher (milestone 7), for
 * search, instant answers and Add a product alike. The trigram index
 * (`brand_search`) finds the brands sharing three letters in a row with the
 * text, and from five letters the brands sharing a typed word's first letter
 * are added for typos, so a lookup never reads every brand; the matcher then
 * keeps and orders the real matches, and products are counted only for
 * those.
 * `everyBrand` includes brands with nothing in the country yet.
 */
export async function matchingBrandResults(
  db: D1Database,
  countryId: string,
  query: string,
  limit: number,
  {
    everyBrand = false,
    after,
  }: { everyBrand?: boolean; after?: BrandPosition | null } = {},
): Promise<BrandMatches> {
  const runs = trigrams(query);
  if (!runs.length) return { items: [], truncated: false };
  const here = `(?2 OR EXISTS(SELECT 1 FROM products p WHERE p.brand_id=b.id AND p.country_id=?1 AND ${COUNTED}))`;
  const found = await db
    .prepare(
      `SELECT b.id,b.slug,b.name,brand_search.aliases FROM brand_search JOIN brands b ON b.id=brand_search.brand_id
      WHERE brand_search MATCH ?3 AND ${here}
      ORDER BY brand_search.rank,b.id LIMIT ${CANDIDATES + 1}`,
    )
    .bind(countryId, everyBrand ? 1 : 0, runs.join(" OR "))
    .all<{ id: string; slug: string; name: string; aliases: string }>();
  // A typo can leave no three letters in a row ("Dayia" for "Daiya"), so
  // once typos are allowed the brands starting with a typed word's first
  // letter go to the matcher too, read through the normalized-name indexes.
  const initials = typoInitials(query);
  const alike = initials.length
    ? await db
        .prepare(
          `SELECT b.id,b.slug,b.name,COALESCE(a.aliases,'[]') AS aliases FROM brands b
          LEFT JOIN (SELECT brand_id,json_group_array(alias) AS aliases FROM brand_aliases GROUP BY brand_id) a ON a.brand_id=b.id
          WHERE b.id IN (SELECT id FROM brands WHERE ${initialRanges(initials)}
            UNION SELECT brand_id FROM brand_aliases WHERE ${initialRanges(initials)})
            AND ${here}
          ORDER BY b.normalized_name,b.id
          LIMIT ${INITIAL_CANDIDATES + 1}`,
        )
        .bind(
          countryId,
          everyBrand ? 1 : 0,
          ...initials.flatMap((letter) => [letter, nextLetter(letter)]),
        )
        .all<{ id: string; slug: string; name: string; aliases: string }>()
    : { results: [] };
  // The extra rows detect either work bound without changing the candidate
  // window or the shared match order. They never receive product counts.
  const truncated =
    found.results.length > CANDIDATES ||
    alike.results.length > INITIAL_CANDIDATES;
  const rows = [
    ...new Map(
      [
        ...found.results.slice(0, CANDIDATES),
        ...alike.results.slice(0, INITIAL_CANDIDATES),
      ].map((row) => [row.id, row]),
    ).values(),
  ];
  const named = rows.flatMap((row) => {
    const aliases = JSON.parse(row.aliases) as string[];
    return [row.name, ...aliases].some(
      (name) => nameMatch(query, name) !== null,
    )
      ? [{ ...row, aliases }]
      : [];
  });
  if (!named.length) return { items: [], truncated };
  const counts = await db
    .prepare(
      `SELECT p.brand_id AS id,COUNT(*) AS count FROM products p
      WHERE p.country_id=? AND ${COUNTED} AND p.brand_id IN (SELECT value FROM json_each(?)) GROUP BY p.brand_id`,
    )
    .bind(countryId, JSON.stringify(named.map((brand) => brand.id)))
    .all<{ id: string; count: number }>();
  const count = new Map(counts.results.map((row) => [row.id, row.count]));
  // Compute the shared match key once per candidate, not on every comparison
  // during sorting or continuation checks (especially useful for typo matches).
  const items = named
    .map((row) => {
      const brand = { ...row, productCount: count.get(row.id) ?? 0 };
      return { brand, position: brandPosition(query, brand) };
    })
    .sort((a, b) => compareBrandPositions(a.position, b.position))
    .filter((row) => !after || compareBrandPositions(row.position, after) > 0)
    .slice(0, limit)
    .map(({ brand }) => brand);
  return { items, truncated };
}

// Suggestions and contribution lookups retain their existing array contract.
export async function matchingBrands(
  ...args: Parameters<typeof matchingBrandResults>
) {
  return (await matchingBrandResults(...args)).items;
}
