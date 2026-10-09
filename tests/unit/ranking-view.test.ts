import { expect, it } from "vitest";
import {
  detailBadges,
  detailScores,
  orderRows,
  parseCategoryView,
  type Question,
} from "../../server/catalog/domain/ranking-view";

const questions: Question[] = [
  { id: "q-taste", key: "taste", label: "Taste" },
  { id: "q-melt", key: "melt", label: "Melt" },
];
const row = (
  id: string,
  topRank: number,
  ratingCount: number,
  stats: Record<string, [number, number]>,
) => ({ id, topRank, ratingCount, details: detailScores(stats, questions) });

it("parses views by syntax", () => {
  expect(parseCategoryView(null)).toBe("top");
  expect(parseCategoryView("most-rated")).toBe("most-rated");
  expect(parseCategoryView("detail-in_coffee")).toBe("detail-in_coffee");
  expect(parseCategoryView("detail-Taste")).toBeNull();
  expect(parseCategoryView("cheapest")).toBeNull();
});

it("shows a detail mean only with five answers", () => {
  expect(
    detailScores({ "q-taste": [4, 20], "q-melt": [5, 21] }, questions),
  ).toEqual([
    { key: "taste", label: "Taste", mean: null, count: 4 },
    { key: "melt", label: "Melt", mean: 4.2, count: 5 },
  ]);
});

it("orders detail sorts by mean, then the rest in Top order, and most rated by count", () => {
  const rows = [
    row("a", 1, 40, { "q-taste": [10, 40] }),
    row("b", 2, 90, { "q-taste": [6, 30] }),
    row("c", 3, 12, { "q-taste": [2, 10] }),
    row("d", 4, 90, { "q-taste": [8, 40] }),
  ];
  const taste = orderRows(rows, "detail-taste");
  expect(taste.rows.map((r) => r.id)).toEqual(["b", "d", "a", "c"]);
  expect(taste.qualified).toBe(3);
  expect(orderRows(rows, "most-rated").rows.map((r) => r.id)).toEqual([
    "b",
    "d",
    "a",
    "c",
  ]);
  expect(orderRows(rows, "top").rows.map((r) => r.id)).toEqual([
    "a",
    "b",
    "c",
    "d",
  ]);
});

it("awards a detail badge to the best qualifying product unless it is #1", () => {
  const badges = detailBadges(
    [
      row("a", 1, 40, { "q-taste": [10, 45], "q-melt": [5, 15] }),
      row("b", 2, 30, { "q-taste": [10, 40], "q-melt": [6, 27] }),
      row("c", 3, 10, { "q-taste": [3, 15] }),
    ],
    questions,
  );
  expect(Object.fromEntries(badges)).toEqual({ b: ["Best melt"] });
});
