import { expect, it } from "vitest";
import {
  catalogBatch,
  decodeContinuation,
  encodeContinuation,
} from "../../server/catalog/domain/batches";
import { appendBatch, BrowseCache } from "../../app/lib/browse-cache";

const batch = (id: string) =>
  catalogBatch([{ id }], 20, { context: "test", batch: 1, after: null }, true);

it("binds cursors to their entire context and caps continuations", () => {
  const cursor = {
    context: JSON.stringify(["us", "crème", "products"]),
    batch: 2,
    after: [-0.012, "Crème", "stable-id"] as [number, string, string],
  };
  expect(
    decodeContinuation(encodeContinuation(cursor), cursor.context),
  ).toEqual(cursor);
  for (const value of [
    "!",
    encodeContinuation({ ...cursor, batch: 101 }),
    encodeContinuation({ ...cursor, after: [NaN, "x", "y"] }),
  ])
    expect(() => decodeContinuation(value, cursor.context)).toThrow();
  expect(() =>
    decodeContinuation(encodeContinuation(cursor), "another country"),
  ).toThrow();
  expect(catalogBatch([], 20, { ...cursor, batch: 100 }, true)).toMatchObject({
    nextCursor: null,
    limitReached: true,
    start: 1980,
  });
  expect(
    catalogBatch([], 20, { ...cursor, batch: 100 }, false).limitReached,
  ).toBe(false);
});

it("deduplicates new rows without replacing earlier batches or items", () => {
  const first = batch("one");
  const next = {
    ...batch("two"),
    items: [{ id: "one" }, { id: "two" }, { id: "two" }],
  };
  const appended = appendBatch([first], next, (row) => row.id);
  expect(appended[0]).toBe(first);
  expect(appended[0]!.items[0]).toBe(first.items[0]);
  expect(appended[1]!.items).toEqual([{ id: "two" }]);
  expect(appended[1]!.nextCursor).toBe(next.nextCursor);
  // A ranking updated between requests must not repeat a divider already seen.
  expect(
    appendBatch(
      [{ ...first, boundaryId: "one" }],
      { ...next, boundaryId: "two" },
      (row) => row.id,
    )[1]!.boundaryId,
  ).toBeNull();
});

it("retains at most three contexts, expires them, and enforces a byte budget", () => {
  let now = 0;
  const cache = new BrowseCache(() => now);
  for (const key of ["a", "b", "c"]) cache.write(key, "foods", [batch(key)]);
  cache.read("a", "foods");
  cache.write("d", "foods", [batch("d")]);
  expect(cache.read("b", "foods")).toBeUndefined();
  expect(cache.read("a", "foods")).toBeDefined();
  cache.write("a", "brands", [batch("brand")]);
  expect(cache.read("a", "foods")).toBeDefined();
  now = 10 * 60_000;
  expect(cache.read("a", "foods")).toBeUndefined();
  const small = new BrowseCache(() => now, 500);
  small.write("a", "foods", [batch("a".repeat(600))]);
  expect(small.read("a", "foods")).toBeUndefined();
});

it("keeps ranking metadata with its batches through appends and eviction", () => {
  let now = 0;
  const cache = new BrowseCache(() => now, 1000);
  const summary = { best: "first", count: 40 };
  const first = batch("first");
  cache.write("ranking", "ranked", [first], ["first"], summary);
  cache.write("ranking", "ranked", [first, batch("second")]);
  expect(cache.readMetadata("ranking", "ranked")).toBe(summary);
  expect(cache.readOpen("ranking", "ranked")).toEqual(["first"]);
  expect(cache.read("ranking", "ranked")).toHaveLength(2);
  now = 10 * 60_000;
  expect(cache.readMetadata("ranking", "ranked")).toBeUndefined();
  expect(cache.read("ranking", "ranked")).toBeUndefined();
  cache.write("ranking", "ranked", [first], [], { text: "x".repeat(1000) });
  expect(cache.read("ranking", "ranked")).toBeUndefined();
  expect(cache.readMetadata("ranking", "ranked")).toBeUndefined();
});
