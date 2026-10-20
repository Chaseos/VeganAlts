import { expect, it } from "vitest";
import {
  searchExpression,
  catalogPage,
} from "../../server/catalog/application/service";
import {
  publicBrowseDestination,
  safeReturnDestination,
} from "../../server/auth/domain/return-destination";
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
  for (const score of [0, 6, 2.5, "4", NaN])
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
  // Client navigations name the page's data URL; contribution pages and
  // every country's pages are valid destinations.
  expect(
    safeReturnDestination(
      "/propose-category.data?country=ca&name=Brie&_routes=routes%2Fpropose-category",
      origin,
    ),
  ).toBe("/propose-category?country=ca&name=Brie");
  expect(safeReturnDestination("/ca/products/brie", origin)).toBe(
    "/ca/products/brie",
  );
  expect(safeReturnDestination("/_root.data", origin)).toBe("/");
  for (const value of [
    "//evil.test",
    "/admin/../api/auth/sign-out",
    "https://evil.test/us/milk",
    "/\\evil.test",
    "javascript:alert(1)",
    "/api/auth/sign-out",
    "/sign-in?returnTo=//evil.test",
    "/us/milk\n",
  ])
    expect(safeReturnDestination(value, origin)).toBe("/account");
});

it("cancels sign-in to public pages while preserving the successful task destination", () => {
  const origin = "https://staging.veganalts.com";
  const product = "/gb/products/oat-milk?food=milk#rate-milk";
  for (const path of [
    "/",
    "/gb/milk?stores=tesco",
    product,
    "/us/brand/oatly",
    "/users/example",
    "/about/rankings",
  ])
    expect(publicBrowseDestination(path, origin)).toBe(path);
  for (const path of [
    "/account",
    "/my-ratings",
    "/contribute/product?action=photo",
    "/admin/moderation",
    "/my-contributions/submission/123",
  ])
    expect(publicBrowseDestination(path, origin)).toBe("/");
  const task = "/add-product?country=gb&food=milk&line=oat";
  expect(safeReturnDestination(task, origin)).toBe(task);
  expect(publicBrowseDestination(task, origin)).toBe("/gb");
  expect(
    publicBrowseDestination(
      "/propose-category.data?country=CA&_routes=routes%2Fpropose-category",
      origin,
    ),
  ).toBe("/ca");
  expect(publicBrowseDestination("/add-product?country=us", origin)).toBe("/");
  for (const path of [
    null,
    "//evil.test/gb/milk",
    "/api/auth/sign-out",
    "/sign-in",
    "/add-product?country=../sign-in",
    "/add-product?country=%2F%2Fevil.test",
  ])
    expect(publicBrowseDestination(path, origin)).toBe("/");
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

it("keeps rating details across sign-in and still honors a score-only v1 selection", () => {
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
  const origin = "https://staging.veganalts.com";
  const action = {
    id: "pending",
    productVersionId: "formula",
    categoryId: "category",
    overallSimilarity: 4,
    dimensions: { taste: 5, texture: null },
    conventionalRecency: "within_month" as const,
    createdAt: 100,
    returnTo: "/us/products/example#rate-category",
  };
  storePendingRating(storage, action);
  expect(readPendingRating(storage, origin, 101)).toEqual(action);
  storePendingRating(storage, { ...action, dimensions: { Taste: 9 } });
  expect(readPendingRating(storage, origin, 101)).toBeNull();
  const { dimensions: _d, conventionalRecency: _r, ...legacy } = action;
  values.set("veganalts.pending-rating.v1", JSON.stringify(legacy));
  expect(readPendingRating(storage, origin, 101)).toEqual(legacy);
  storePendingRating(storage, action);
  readPendingRating(storage, origin, 101 + PENDING_RATING_TTL);
  expect(values.size).toBe(0);
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

it("preserves a taste-only selection across sign-in and accepts independent rating answers", () => {
  const draft = {
    id: "pending",
    productVersionId: "formula",
    categoryId: "category",
    overallSimilarity: null,
    enjoyment: 5,
    returnTo: "/us/products/milk#rate-category",
    createdAt: 100,
  };
  let stored = "";
  const storage = {
    getItem: () => stored || null,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
    removeItem: () => {
      stored = "";
    },
  };
  storePendingRating(storage, draft);
  expect(
    readPendingRating(storage, "https://staging.veganalts.com", 101),
  ).toEqual(draft);
  expect(
    ratingInput.safeParse({
      productVersionId: "formula",
      categoryId: "category",
      overallSimilarity: null,
      enjoyment: 5,
    }).success,
  ).toBe(true);
  expect(
    ratingInput.safeParse({
      productVersionId: "formula",
      categoryId: "category",
      overallSimilarity: null,
      enjoyment: 0,
    }).success,
  ).toBe(false);
});

it("does not forget a newer taste-only pending answer when an older save finishes", async () => {
  const { matchesPendingRating } = await import("../../app/lib/pending-rating");
  const pending = {
    id: "pending",
    productVersionId: "formula",
    categoryId: "category",
    overallSimilarity: null,
    enjoyment: 5,
    createdAt: 100,
    returnTo: "/",
  };
  const saved = {
    id: "saved",
    productVersionId: "formula",
    categoryId: "category",
    overallSimilarity: null,
    enjoyment: 3,
    dimensions: {},
    conventionalRecency: null,
    updatedAt: 100,
  };
  expect(matchesPendingRating(pending, saved)).toBe(false);
  expect(matchesPendingRating(pending, { ...saved, enjoyment: 5 })).toBe(true);
});
