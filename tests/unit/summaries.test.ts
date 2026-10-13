import { expect, it } from "vitest";
import { categorySummary } from "../../app/lib/summaries";

it("summarizes a food's ranking in one sentence", () => {
  expect(
    categorySummary({
      food: "Ground Beef",
      rankedCount: 6,
      people: 1234,
      best: { name: "Impossible Beef", score: 4.6, early: false },
    }),
  ).toBe(
    "6 vegan ground beef swaps ranked by 1,234 people who’ve tried them. Impossible Beef comes closest, at 4.6 out of 5.",
  );
  expect(
    categorySummary({
      food: "Bacon",
      rankedCount: 1,
      people: 1,
      best: { name: "Smart Bacon", score: 3.6, early: true },
    }),
  ).toBe(
    "1 vegan bacon swap ranked by 1 person who’s tried it. Smart Bacon comes closest so far, at 3.6 out of 5.",
  );
  expect(
    categorySummary({
      food: "Eggs",
      rankedCount: 0,
      people: 0,
      best: null,
    }),
  ).toMatch(/^No vegan eggs swaps are ranked yet/);
  // The Tastiest ranking names its own #1.
  expect(
    categorySummary({
      food: "Milk",
      rankedCount: 4,
      people: 30,
      best: { name: "Oat Milk", score: 4.4, early: false },
      tastiest: true,
    }),
  ).toBe(
    "4 vegan milk swaps ranked by 30 people who’ve tried them. Oat Milk is the tastiest, at 4.4 out of 5.",
  );
});
