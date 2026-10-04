import { describe, expect, it } from "vitest";
import {
  aggregateFormula,
  compareRankedProducts,
  INITIAL_RANKING_PARAMETERS as parameters,
  scoreAggregate,
} from "../../server/ranking/domain/policy";

describe("authoritative ranking policy", () => {
  it("does not let a tiny perfect sample outrank established 4.7 feedback", () => {
    expect(scoreAggregate(5, 1, parameters).bayesianScore).toBeLessThan(
      scoreAggregate(4700, 1000, parameters).bayesianScore!,
    );
    expect(scoreAggregate(0, 0, parameters)).toEqual({
      rawAverage: null,
      bayesianScore: null,
    });
  });
  it("breaks ties by rating count, then stable ID", () => {
    const a = { productId: "a", bayesianScore: 4, ratingCount: 10 };
    const b = { ...a, productId: "b" };
    const c = { ...a, productId: "c", ratingCount: 11 };
    expect([b, a, c].sort(compareRankedProducts)).toEqual([c, a, b]);
  });
  it("counts categories independently, excludes flagged ratings and deduplicates Tried", () => {
    const base = { userId: "u", isCounted: true, createdAt: 1, updatedAt: 1 };
    const result = aggregateFormula(
      ["burger", "ground"],
      [
        { ...base, id: "1", categoryId: "burger", score: 5 },
        { ...base, id: "2", categoryId: "ground", score: 2 },
        { ...base, id: "3", categoryId: "burger", score: 1, isCounted: false },
      ],
      ["u", "u"],
      parameters,
      100,
    );
    expect(
      result.map(({ ratingSum, ratingCount, triedCount }) => [
        ratingSum,
        ratingCount,
        triedCount,
      ]),
    ).toEqual([
      [5, 1, 1],
      [2, 1, 1],
    ]);
  });
  it("rejects invalid configurations and impossible aggregates", () => {
    expect(() => scoreAggregate(2, 3, parameters)).toThrow();
    expect(() =>
      scoreAggregate(5, 1, { priorMean: 7, priorStrength: 10 }),
    ).toThrow();
    expect(() =>
      scoreAggregate(5, 1, { priorMean: 3.5, priorStrength: 0 }),
    ).toThrow();
  });
});
