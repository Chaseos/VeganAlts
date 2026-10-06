import { expect, it } from "vitest";
import {
  searchExpression,
  catalogPage,
} from "../../server/catalog/application/service";
import { safeReturnDestination } from "../../server/auth/domain/return-destination";
import {
  decodeRatingCursor,
  encodeRatingCursor,
  PersonalRatingsService,
} from "../../server/ratings/application/personal-service";
import { ratingInput } from "../../server/ratings/domain/contracts";
import {
  readPendingRating,
  storePendingRating,
  PENDING_RATING_TTL,
} from "../../app/lib/pending-rating";

it("treats malformed search and FTS syntax as bounded literal tokens", () => {
  expect(searchExpression('beef" OR title:cheese*').expression).toBe(
    '"beef"* AND "OR"* AND "title"* AND "cheese"*',
  );
  expect(searchExpression('" * () -').expression).toBe("");
  expect(searchExpression("x".repeat(200)).query.length).toBe(80);
  expect(() => catalogPage("1 OR 1")).toThrow();
  expect(() => catalogPage("101")).toThrow();
  expect(catalogPage(null)).toBe(1);
});

it("validates scores, opaque private cursors, and same-origin application return paths", () => {
  for (const score of [0, 6, 2.5, "4", null, NaN])
    expect(
      ratingInput.safeParse({
        productVersionId: "formula",
        categoryId: "category",
        overallSimilarity: score,
      }).success,
    ).toBe(false);
  const cursor = { updatedAt: 1791000000000, id: "rating-id" };
  expect(decodeRatingCursor(encodeRatingCursor(cursor))).toEqual(cursor);
  for (const value of [
    "bad!",
    btoa('{"updatedAt":-1,"id":"a"}'),
    "a".repeat(251),
  ])
    expect(() => decodeRatingCursor(value)).toThrow();
  const origin = "https://staging.veganalts.com";
  expect(
    safeReturnDestination("/us/products/example?version=old#rate-cat", origin),
  ).toBe("/us/products/example?version=old#rate-cat");
  for (const value of [
    "//evil.test",
    "https://evil.test/us/milk",
    "/\\evil.test",
    "javascript:alert(1)",
    "/api/auth/sign-out",
    "/sign-in?returnTo=//evil.test",
    "/us/milk\n",
  ])
    expect(safeReturnDestination(value, origin)).toBe("/account");
});

it("keeps a pending action bound to its original formula, category and tab until expiry", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const action = {
    id: "pending",
    productVersionId: "original-formula",
    categoryId: "original-category",
    overallSimilarity: 4,
    createdAt: 100,
    returnTo: "/us/products/example#rate-original-category",
  };
  storePendingRating(storage, action);
  expect(
    readPendingRating(storage, "https://staging.veganalts.com", 101),
  ).toEqual(action);
  expect(
    readPendingRating(
      storage,
      "https://staging.veganalts.com",
      101 + PENDING_RATING_TTL,
    ),
  ).toBeNull();
  expect(values.size).toBe(0);
  storePendingRating(storage, { ...action, returnTo: "https://evil.test" });
  expect(
    readPendingRating(storage, "https://staging.veganalts.com", 101),
  ).toBeNull();
});

it("bounds anonymous personal-state requests before any repository read", async () => {
  const service = new PersonalRatingsService({
    state: () => {
      throw new Error("Anonymous state must not query ratings");
    },
    list: async () => [],
  });
  expect(await service.state(null, "formula-one,formula-two")).toEqual({
    ratings: [],
    triedVersionIds: [],
  });
  expect(() => service.state(null, "invalid/id")).toThrow("valid formula IDs");
  expect(() => service.state(null, "x".repeat(1481))).toThrow(
    "valid formula IDs",
  );
});
