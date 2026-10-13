import { expect, it } from "vitest";
import {
  matchBrands,
  nameMatch,
} from "../../server/catalog/domain/brand-match";

const brand = (name: string, productCount = 1, aliases: string[] = []) => ({
  name,
  aliases,
  productCount,
});
const brands = [
  brand("Impossible", 6),
  brand("Trader Joe's", 40),
  brand("Gardein", 12),
  brand("Beyond Meat", 9, ["Beyond"]),
  brand("Daring", 4),
  brand("Beef Co", 1),
];
const names = (query: string, limit = 5) =>
  matchBrands(query, brands, limit).map((b) => b.name);

it("matches a brand from a partial, loose or mistyped name", () => {
  expect(names("Impossibl")).toEqual(["Impossible"]);
  // A product name that starts with the brand still finds it.
  expect(names("Impossible Meat")).toContain("Impossible");
  expect(names("trader joes")).toEqual(["Trader Joe's"]);
  expect(names("joes")).toEqual(["Trader Joe's"]);
  expect(names("Gardien")).toEqual(["Gardein"]);
  expect(names("Beyond")[0]).toBe("Beyond Meat");
});

it("needs two letters and keeps short text strict", () => {
  expect(names("b")).toEqual([]);
  // Two letters only match names starting with them, never by typos.
  expect(names("be")).toEqual(["Beyond Meat", "Beef Co"]);
  // "meat" is one typo-letter too far from "beef".
  expect(nameMatch("meat", "Beef Co")).toBeNull();
});

it("ranks exact and prefix matches first, then by product count", () => {
  expect(nameMatch("daring", "Daring")).toBe(0);
  expect(nameMatch("dar", "Daring")).toBe(1);
  expect(names("be", 1)).toEqual(["Beyond Meat"]);
});
