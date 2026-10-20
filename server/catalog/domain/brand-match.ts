// The shared brand matcher (milestone 7): search answers, brand pages and
// Add a product's brand choice all match brands the same way. From two
// characters, a brand matches when its name or another of its names equals or
// starts with the typed text, has a word starting with a typed word, contains
// the typed text, or is within a few typos of it.

export interface BrandCandidate {
  name: string;
  aliases: readonly string[];
  productCount: number;
}

export function brandPosition(
  query: string,
  brand: BrandCandidate & { id: string },
): import("./batches").BrandPosition {
  return [
    Math.min(
      ...[brand.name, ...brand.aliases].map(
        (name) => nameMatch(query, name) ?? Infinity,
      ),
    ),
    -brand.productCount,
    brand.name,
    brand.id,
  ];
}
export function compareBrandPositions(
  a: import("./batches").BrandPosition,
  b: import("./batches").BrandPosition,
) {
  return (
    a[0] - b[0] ||
    a[1] - b[1] ||
    a[2].localeCompare(b[2]) ||
    a[3].localeCompare(b[3])
  );
}

const words = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
const compact = (value: string) => words(value).join("");

// Typos allowed for a typed text of this length (docs/API.md, milestone 7):
// two edits from five letters, none below, so short text stays strict.
const allowedTypos = (length: number) => (length >= 5 ? 2 : 0);

function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      best = Math.min(best, current[j]!);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length]!;
}

/** How well a name matches the typed text: lower is better; null is none. */
export function nameMatch(query: string, name: string): number | null {
  const typed = compact(query);
  if (typed.length < 2) return null;
  const full = compact(name);
  if (!full) return null;
  if (full === typed) return 0;
  if (full.startsWith(typed)) return 1;
  const typedWords = words(query).filter((word) => word.length >= 2);
  const nameWords = words(name);
  if (nameWords.some((word) => typedWords.some((t) => word.startsWith(t))))
    return 2;
  if (full.includes(typed)) return 3;
  // Typos: against the whole name, the start of it, or word by word.
  const limit = allowedTypos(typed.length);
  const whole = Math.min(
    distance(typed, full, limit),
    distance(typed, full.slice(0, typed.length), limit),
  );
  // Each typed word is held to its own length's allowance.
  const perWord = typedWords.flatMap((t) =>
    nameWords.flatMap((word) => {
      const d = distance(t, word, allowedTypos(t.length));
      return d <= allowedTypos(t.length) ? [d] : [];
    }),
  );
  const typos = Math.min(whole <= limit ? whole : Infinity, ...perWord);
  return Number.isFinite(typos) ? 4 + typos : null;
}

/** Brands matching the typed text, best first, then by product count. */
export function matchBrands<T extends BrandCandidate>(
  query: string,
  brands: readonly T[],
  limit: number,
): T[] {
  return brands
    .flatMap((brand) => {
      const scores = [brand.name, ...brand.aliases]
        .map((name) => nameMatch(query, name))
        .filter((score): score is number => score !== null);
      return scores.length ? [{ brand, score: Math.min(...scores) }] : [];
    })
    .sort(
      (a, b) =>
        a.score - b.score ||
        b.brand.productCount - a.brand.productCount ||
        a.brand.name.localeCompare(b.brand.name),
    )
    .slice(0, limit)
    .map(({ brand }) => brand);
}
