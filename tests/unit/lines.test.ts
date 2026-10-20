import { describe, expect, it } from "vitest";
import {
  aggregateLine,
  leadFlavor,
  type LineFlavor,
  type LineRating,
} from "../../server/ranking/domain/lines";
import {
  INITIAL_SCORING,
  scoreAggregate,
} from "../../server/ranking/domain/policy";

const NOW = 1_000 * 86400_000;
const flavor = (productId: string, publishedAt: number | null = 1) => ({
  productId,
  eligible: true,
  publishedAt,
});
const rating = (
  productId: string,
  userId: string,
  similarity: number,
  extra: Partial<LineRating> = {},
): LineRating => ({
  productId,
  userId,
  similarity,
  enjoyment: null,
  counted: true,
  createdAt: NOW,
  ...extra,
});

describe("recipe lines", () => {
  it("gives each person one vote: the mean of their flavors", () => {
    const line = aggregateLine(
      [flavor("a"), flavor("b"), flavor("c")],
      [
        rating("a", "u1", 3),
        rating("b", "u1", 4),
        rating("c", "u1", 5),
        rating("a", "u2", 2),
      ],
      [],
      INITIAL_SCORING,
      NOW,
    )!;
    expect(line).toMatchObject({
      peopleCount: 2,
      meanSum: 6,
      rawAverage: 3,
      bayesianScore: (6 + 35) / 12,
    });
    // Never the best flavor's score.
    expect(line.bayesianScore).not.toBe(
      scoreAggregate(5, 1, INITIAL_SCORING.closest).bayesianScore,
    );
  });

  it("scores one flavor exactly as the product", () => {
    const own = [5, 4, 4, 2].map((score, i) => rating("a", `u${i}`, score));
    expect(
      aggregateLine([flavor("a")], own, [], INITIAL_SCORING, NOW)!
        .bayesianScore,
    ).toBe(scoreAggregate(15, 4, INITIAL_SCORING.closest).bayesianScore);
  });

  it("keeps Tastiest apart from Closest", () => {
    const plain = [rating("a", "u1", 4), rating("b", "u2", 2)];
    const tasted = [
      rating("a", "u1", 4, { enjoyment: 5 }),
      rating("b", "u2", 2, { enjoyment: 3 }),
    ];
    const without = aggregateLine(
      [flavor("a"), flavor("b")],
      plain,
      [],
      INITIAL_SCORING,
      NOW,
    )!;
    const withAnswers = aggregateLine(
      [flavor("a"), flavor("b")],
      tasted,
      [],
      INITIAL_SCORING,
      NOW,
    )!;
    expect(withAnswers.bayesianScore).toBe(without.bayesianScore);
    expect(without).toMatchObject({ enjoymentPeople: 0, enjoymentScore: null });
    expect(withAnswers).toMatchObject({
      enjoymentPeople: 2,
      enjoymentAverage: 4,
      enjoymentScore: (8 + 35) / 12,
    });
    // Tastiest uses its own prior.
    expect(
      aggregateLine(
        [flavor("a")],
        tasted.slice(0, 1),
        [],
        { ...INITIAL_SCORING, tastiest: { priorMean: 3, priorStrength: 4 } },
        NOW,
      )?.enjoymentScore,
    ).toBe((5 + 12) / 5);
  });

  it("leaves out ineligible flavors, excluded ratings and old activity", () => {
    const line = aggregateLine(
      [flavor("a"), { ...flavor("gone"), eligible: false }],
      [
        rating("a", "u1", 4, { createdAt: NOW - 8 * 86400_000 }),
        rating("a", "u2", 1, { counted: false }),
        rating("gone", "u3", 5),
      ],
      [
        { productId: "a", userId: "u1" },
        { productId: "gone", userId: "u3" },
      ],
      INITIAL_SCORING,
      NOW,
    )!;
    expect(line).toMatchObject({
      peopleCount: 1,
      triedCount: 1,
      recentCount: 0,
    });
    // A line whose flavors all left has no standing.
    expect(
      aggregateLine(
        [{ ...flavor("a"), eligible: false }],
        [rating("a", "u1", 4)],
        [],
        INITIAL_SCORING,
        NOW,
      ),
    ).toBeNull();
  });

  it("averages each person's detail answers across flavors", () => {
    const line = aggregateLine(
      [flavor("a"), flavor("b")],
      [
        rating("a", "u1", 4, { answers: { taste: 2, texture: 5 } }),
        rating("b", "u1", 4, { answers: { taste: 4 } }),
        rating("a", "u2", 3, { answers: { taste: 5 } }),
      ],
      [],
      INITIAL_SCORING,
      NOW,
    )!;
    expect(line.dimensions).toEqual([
      { dimensionId: "taste", peopleCount: 2, meanSum: 8 },
      { dimensionId: "texture", peopleCount: 1, meanSum: 5 },
    ]);
  });

  it("leads with the most-rated flavor, then its score, then the earliest published", () => {
    const flavors: LineFlavor[] = [
      flavor("b", 5),
      flavor("a", 5),
      flavor("late", 9),
      flavor("unpublished", null),
    ];
    const lead = (counted: LineRating[]) =>
      leadFlavor(flavors, counted, INITIAL_SCORING).productId;
    expect(lead([rating("late", "u1", 1), rating("late", "u2", 1)])).toBe(
      "late",
    );
    expect(lead([rating("b", "u1", 5), rating("late", "u2", 2)])).toBe("b");
    // No ratings: the earliest published, then the product ID; unpublished
    // flavors come last.
    expect(lead([])).toBe("a");
    expect(
      leadFlavor(
        [flavor("unpublished", null), flavor("z", 7)],
        [],
        INITIAL_SCORING,
      ).productId,
    ).toBe("z");
  });
});

it("averages each person's answered flavors independently for each ranking", () => {
  const line = aggregateLine(
    [flavor("a"), flavor("b"), flavor("c")],
    [
      rating("a", "u1", 2, { enjoyment: null }),
      rating("b", "u1", 4, { enjoyment: 5 }),
      rating("c", "u1", 1, { similarity: null, enjoyment: 3 }),
      rating("a", "u2", 1, { similarity: null, enjoyment: 5 }),
    ],
    [],
    INITIAL_SCORING,
    NOW,
  )!;
  expect(line).toMatchObject({
    peopleCount: 1,
    meanSum: 3,
    rawAverage: 3,
    enjoymentPeople: 2,
    enjoymentMeanSum: 9,
    enjoymentAverage: 4.5,
    recentCount: 1,
  });
  const tasteOnly = aggregateLine(
    [flavor("a")],
    [rating("a", "u", 1, { similarity: null, enjoyment: 5 })],
    [],
    INITIAL_SCORING,
    NOW,
  )!;
  expect(tasteOnly).toMatchObject({
    peopleCount: 0,
    bayesianScore: null,
    meanSum: 0,
    recentCount: 0,
    enjoymentPeople: 1,
    enjoymentScore: 40 / 11,
  });
});
