// Ranking filters reach the server only as query parameters, so every cache
// variant is one normalized URL: values are lowercased, de-duplicated, sorted
// and syntax-checked here (in the gateway and in the browser); the loader then
// drops values the country does not offer.
export const MAX_STORES = 10;
export const MAX_FREE_FROM = 20;

const STORE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;
const ALLERGEN = /^[a-z][a-z_]{1,29}$/;

export interface RankingFilters {
  stores: string[];
  freeFrom: string[];
}

export const NO_FILTERS: RankingFilters = { stores: [], freeFrom: [] };

function normalizeList(values: string[], pattern: RegExp, max: number) {
  const items = values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => pattern.test(value));
  return [...new Set(items)].sort().slice(0, max);
}

export function normalizeStores(values: string[]) {
  return normalizeList(values, STORE, MAX_STORES);
}

export function normalizeFreeFrom(values: string[]) {
  return normalizeList(values, ALLERGEN, MAX_FREE_FROM);
}

export function readFilters(params: URLSearchParams): RankingFilters {
  return {
    stores: normalizeStores(params.getAll("stores")),
    freeFrom: normalizeFreeFrom(params.getAll("freeFrom")),
  };
}

export function hasFilters(filters: RankingFilters) {
  return filters.stores.length > 0 || filters.freeFrom.length > 0;
}

// True when the URL already carries exactly the normalized form: one
// parameter per filter, comma-joined in sorted order.
export function filtersAreNormalized(params: URLSearchParams) {
  const filters = readFilters(params);
  return (["stores", "freeFrom"] as const).every((key) => {
    const raw = params.getAll(key);
    const normalized = filters[key].join(",");
    return normalized
      ? raw.length === 1 && raw[0] === normalized
      : raw.length === 0;
  });
}

// Writes the normalized filters into a copy of the parameters, keeping others.
export function applyFilters(params: URLSearchParams, filters: RankingFilters) {
  const next = new URLSearchParams(params);
  next.delete("stores");
  next.delete("freeFrom");
  if (filters.stores.length) next.set("stores", filters.stores.join(","));
  if (filters.freeFrom.length) next.set("freeFrom", filters.freeFrom.join(","));
  next.sort();
  return next;
}

export function intersectFilters(
  filters: RankingFilters,
  available: { stores: string[]; freeFrom: string[] },
): RankingFilters {
  return {
    stores: filters.stores.filter((slug) => available.stores.includes(slug)),
    freeFrom: filters.freeFrom.filter((key) =>
      available.freeFrom.includes(key),
    ),
  };
}
