import { ApplicationError } from "../../shared/domain/errors";

export const MAX_BATCHES = 100;
export const SEARCH_SIZES = { foods: 12, products: 20, brands: 10 } as const;
export type SearchSection = keyof typeof SEARCH_SIZES;
export type RankingSection = "ranked" | "unranked";
export type SearchPosition = [number, string, string];
export type BrandPosition = [number, number, string, string];
export interface CatalogBatch<T> {
  items: T[];
  nextCursor: string | null;
  limitReached: boolean;
  start: number;
  boundaryId: string | null;
}
export interface Continuation {
  context: string;
  batch: number;
  after: SearchPosition | BrandPosition | null;
}

export function batchSection<T extends string>(
  value: string | null,
  choices: readonly T[],
): T | undefined {
  if (value === null) return undefined;
  if (choices.includes(value as T)) return value as T;
  throw new ApplicationError(
    "INVALID_SECTION",
    "Choose a valid results section.",
  );
}

export function encodeContinuation(value: Continuation) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
export function decodeContinuation(
  raw: string | null | undefined,
  context: string,
): Continuation {
  if (!raw) return { context, batch: 1, after: null };
  try {
    if (raw.length > 3000 || !/^[\w-]+$/.test(raw)) throw new Error();
    const value: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(
          atob(raw.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    if (!value || typeof value !== "object") throw new Error();
    const c = value as Continuation;
    if (
      c.context !== context ||
      !Number.isInteger(c.batch) ||
      c.batch < 1 ||
      c.batch > MAX_BATCHES
    )
      throw new Error();
    if (
      c.after !== null &&
      !(
        Array.isArray(c.after) &&
        ((c.after.length === 3 && typeof c.after[1] === "string") ||
          (c.after.length === 4 &&
            typeof c.after[1] === "number" &&
            Number.isFinite(c.after[1]))) &&
        typeof c.after[0] === "number" &&
        Number.isFinite(c.after[0]) &&
        c.after.slice(-2).every((v) => typeof v === "string" && v.length <= 300)
      )
    )
      throw new Error();
    return c;
  } catch {
    throw new ApplicationError(
      "INVALID_CURSOR",
      "These results have changed. Refresh the results and try again.",
    );
  }
}
export function catalogBatch<T>(
  items: T[],
  size: number,
  cursor: Continuation,
  hasMore: boolean,
  after: Continuation["after"] = null,
  boundaryId: string | null = null,
): CatalogBatch<T> {
  return {
    items,
    nextCursor:
      hasMore && cursor.batch < MAX_BATCHES
        ? encodeContinuation({ ...cursor, batch: cursor.batch + 1, after })
        : null,
    limitReached: hasMore && cursor.batch === MAX_BATCHES,
    start: (cursor.batch - 1) * size,
    boundaryId,
  };
}
