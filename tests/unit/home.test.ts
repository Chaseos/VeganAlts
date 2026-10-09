import { expect, it } from "vitest";
import {
  startWithThese,
  stillWaiting,
  type FoodLeader,
} from "../../server/catalog/domain/home";

const leader = (
  id: string,
  best?: { score: number; ratings: number },
): FoodLeader => ({
  food: { id, slug: id, name: id },
  best: best
    ? {
        categoryId: id,
        id: `${id}-1`,
        slug: `${id}-1`,
        name: `${id} #1`,
        brand: null,
        bayesianScore: best.score,
        ratingCount: best.ratings,
        rank: 1,
      }
    : null,
});

it("starts with established #1s, closest first, then fills from features", () => {
  const leaders = [
    leader("milk", { score: 4.1, ratings: 40 }),
    leader("butter", { score: 4.6, ratings: 12 }),
    leader("eggs", { score: 4.9, ratings: 3 }),
    leader("bacon", { score: 3.2, ratings: 25 }),
    leader("cheddar"),
  ];
  expect(
    startWithThese(leaders, ["cheddar", "eggs", "milk"], 6).map(
      (l) => l.food.id,
    ),
  ).toEqual(["butter", "milk", "bacon", "eggs"]);
  expect(startWithThese(leaders, [], 2).map((l) => l.food.id)).toEqual([
    "butter",
    "milk",
  ]);
});

it("lists foods still waiting for a great swap, weakest first, then empty ones", () => {
  const leaders = [
    leader("milk", { score: 4.1, ratings: 40 }),
    leader("bacon", { score: 3.2, ratings: 25 }),
    leader("nuggets", { score: 2.4, ratings: 2 }),
    leader("cheddar"),
    leader("brie"),
  ];
  expect(stillWaiting(leaders).map((l) => l.food.id)).toEqual([
    "nuggets",
    "bacon",
    "brie",
    "cheddar",
  ]);
  expect(stillWaiting(leaders, 1).map((l) => l.food.id)).toEqual(["nuggets"]);
});
