export interface RankingParameters {
  priorMean: number;
  priorStrength: number;
}
export const INITIAL_RANKING_PARAMETERS: Readonly<RankingParameters> = {
  priorMean: 3.5,
  priorStrength: 10,
};
// Closest to the original and Tastiest each have their own prior (milestone
// 7); Tastiest starts with the same values.
export interface Scoring {
  closest: RankingParameters;
  tastiest: RankingParameters;
}
export const INITIAL_SCORING: Readonly<Scoring> = {
  closest: INITIAL_RANKING_PARAMETERS,
  tastiest: INITIAL_RANKING_PARAMETERS,
};

export function validateRankingParameters(
  parameters: RankingParameters,
): RankingParameters {
  if (
    !Number.isFinite(parameters.priorMean) ||
    parameters.priorMean < 1 ||
    parameters.priorMean > 5 ||
    !Number.isFinite(parameters.priorStrength) ||
    parameters.priorStrength <= 0
  ) {
    throw new RangeError(
      "Ranking requires a prior mean between 1 and 5 and a positive prior strength.",
    );
  }
  return parameters;
}

export function scoreAggregate(
  ratingSum: number,
  ratingCount: number,
  parameters: RankingParameters,
) {
  validateRankingParameters(parameters);
  if (
    !Number.isSafeInteger(ratingCount) ||
    ratingCount < 0 ||
    !Number.isSafeInteger(ratingSum) ||
    ratingSum < ratingCount ||
    ratingSum > ratingCount * 5
  )
    throw new RangeError("Invalid rating aggregate.");
  return {
    rawAverage: ratingCount === 0 ? null : ratingSum / ratingCount,
    bayesianScore:
      ratingCount === 0
        ? null
        : (ratingSum + parameters.priorMean * parameters.priorStrength) /
          (ratingCount + parameters.priorStrength),
  };
}

export interface RankedProduct {
  productId: string;
  ratingCount: number;
  bayesianScore: number | null;
}
export function compareRankedProducts(
  a: RankedProduct,
  b: RankedProduct,
): number {
  return (
    (b.bayesianScore ?? -Infinity) - (a.bayesianScore ?? -Infinity) ||
    b.ratingCount - a.ratingCount ||
    (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0)
  );
}

export interface CanonicalRating {
  id: string;
  userId: string;
  categoryId: string;
  score: number | null;
  // The independent Tastiest answer; it never enters Closest.
  enjoyment: number | null;
  isCounted: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface CategoryAggregate {
  categoryId: string;
  ratingCount: number;
  ratingSum: number;
  rawAverage: number | null;
  bayesianScore: number | null;
  triedCount: number;
  recentRatingCount: number;
  // The flavor's Tastiest figures over counted ratings with an answer.
  enjoymentCount: number;
  enjoymentSum: number;
  enjoymentScore: number | null;
  recomputedAt: number;
}

// Used by ordinary writes and the full rebuild. SQL only persists these results.
export function aggregateFormula(
  categoryIds: readonly string[],
  ratings: readonly CanonicalRating[],
  triedUserIds: readonly string[],
  parameters: RankingParameters,
  now: number,
  tastiest: RankingParameters = INITIAL_SCORING.tastiest,
): CategoryAggregate[] {
  return categoryIds.map((categoryId) => {
    const counted = ratings.filter(
      (rating) => rating.categoryId === categoryId && rating.isCounted,
    );
    const compared = counted.filter((rating) => rating.score !== null);
    const ratingCount = compared.length;
    const ratingSum = compared.reduce((sum, rating) => sum + rating.score!, 0);
    const enjoyed = counted.filter((rating) => rating.enjoyment !== null);
    const enjoymentSum = enjoyed.reduce(
      (sum, rating) => sum + rating.enjoyment!,
      0,
    );
    return {
      categoryId,
      ratingCount,
      ratingSum,
      ...scoreAggregate(ratingSum, ratingCount, parameters),
      enjoymentCount: enjoyed.length,
      enjoymentSum,
      enjoymentScore: scoreAggregate(enjoymentSum, enjoyed.length, tastiest)
        .bayesianScore,
      triedCount: new Set(triedUserIds).size,
      recentRatingCount: compared.filter(
        (rating) => rating.createdAt >= now - 7 * 86400_000,
      ).length,
      recomputedAt: now,
    };
  });
}
