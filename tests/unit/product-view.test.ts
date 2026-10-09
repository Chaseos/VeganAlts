import { expect, it } from "vitest";
import {
  distribution,
  recentEaters,
} from "../../server/catalog/domain/product-view";

it("shows the recent eaters' score only with ten of their ratings", () => {
  const rows = [
    { recency: "current_or_week", score: 5, count: 3 },
    { recency: "within_year", score: 4, count: 6 },
    { recency: "over_year", score: 1, count: 20 },
    { recency: "unanswered", score: 3, count: 40 },
  ];
  expect(recentEaters(rows)).toBeNull();
  expect(
    recentEaters([...rows, { recency: "within_month", score: 2, count: 1 }]),
  ).toEqual({ count: 10, average: (15 + 24 + 2) / 10 });
  expect(distribution(rows)).toEqual([
    { score: 5, count: 3 },
    { score: 4, count: 6 },
    { score: 3, count: 40 },
    { score: 2, count: 0 },
    { score: 1, count: 20 },
  ]);
});
