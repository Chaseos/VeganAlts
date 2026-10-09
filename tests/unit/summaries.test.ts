import { expect, it } from "vitest";
import { categorySummary } from "../../app/lib/summaries";

it("summarizes a food's ranking in one sentence", () => {
  expect(
    categorySummary({
      food: "Ground Beef",
      rankedCount: 6,
      ratingCount: 1234,
      best: { name: "Impossible Beef", bayesianScore: 4.6, early: false },
    }),
  ).toBe(
    "6 vegan ground beef swaps ranked by 1,234 ratings from people who’ve tried them. Impossible Beef comes closest, at 4.6 out of 5.",
  );
  expect(
    categorySummary({
      food: "Bacon",
      rankedCount: 1,
      ratingCount: 1,
      best: { name: "Smart Bacon", bayesianScore: 3.6, early: true },
    }),
  ).toBe(
    "1 vegan bacon swap ranked by 1 rating from people who’ve tried them. Smart Bacon comes closest so far, at 3.6 out of 5.",
  );
  expect(
    categorySummary({
      food: "Eggs",
      rankedCount: 0,
      ratingCount: 0,
      best: null,
    }),
  ).toMatch(/^No vegan eggs swaps are ranked yet/);
});
