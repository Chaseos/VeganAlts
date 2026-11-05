import {
  identityKey,
  normalizeName,
} from "../../server/community/domain/policy";

// Brand and product identity for merging photo groups, using the site's own
// rules: normalizeName for brands and identityKey, which ignores package
// sizes, for products.

const MARKS = /[®™©℠]/g;

/** Trademark signs go first, because NFKC turns ™ into "tm". */
export const brandKey = (brand: string) =>
  normalizeName(brand.replace(MARKS, ""));

/** The site's identity key plus the flavor, so flavors never merge. */
export const productKey = (brand: string, name: string, flavor?: string) =>
  `${identityKey("US", brand.replace(MARKS, ""), name.replace(MARKS, ""))}:${normalizeName(flavor ?? "")}`;

const STOP_WORDS = new Set(["and", "the", "with", "of", "a", "in"]);
const SIZE = /^\d+(?:\.\d+)?(?:oz|g|kg|ml|l|lb|lbs|ct|pk|pack)?$/;

export function nameTokens(name: string) {
  const words =
    name
      .replace(MARKS, "")
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    words.filter((word) => !STOP_WORDS.has(word) && !SIZE.test(word)),
  );
}

/** Shared words over all words (0–1). */
export function tokenOverlap(a: string, b: string) {
  const first = nameTokens(a);
  const second = nameTokens(b);
  const shared = [...first].filter((word) => second.has(word)).length;
  const all = new Set([...first, ...second]).size;
  return all ? shared / all : 0;
}

// Words that don't tell brands apart ("Daiya" and "Daiya Foods").
const GENERIC = new Set([
  "food",
  "foods",
  "company",
  "co",
  "inc",
  "brand",
  "brands",
  "the",
]);
const brandCore = (brand: string) =>
  [...nameTokens(brand)].filter((word) => !GENERIC.has(word)).join("");

function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * Two spellings that may be one brand: the same once generic words go
 * ("Daiya Foods"), one extending the other ("Beyond Meat"), or a typo of one
 * letter (two from eight). Stricter than the site's search matcher
 * (brand-match.ts), which accepts any shared word prefix and pairs unrelated
 * brands. Short names only match exactly, so "Hu" never pulls in "Hungry".
 */
export function brandsMayMatch(a: string, b: string) {
  const first = brandCore(a);
  const second = brandCore(b);
  if (!first || !second) return false;
  if (first === second) return true;
  const shorter = Math.min(first.length, second.length);
  if (shorter < 4) return false;
  if (first.startsWith(second) || second.startsWith(first)) return true;
  const limit = shorter >= 8 ? 2 : 1;
  return distance(first, second, limit) <= limit;
}

/** Union-find over string ids. */
export class Clusters {
  private readonly parent = new Map<string, string>();
  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }
  find(id: string): string {
    this.add(id);
    const parent = this.parent.get(id)!;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }
  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
  members() {
    const groups = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      groups.set(root, [...(groups.get(root) ?? []), id]);
    }
    return [...groups.values()];
  }
}
