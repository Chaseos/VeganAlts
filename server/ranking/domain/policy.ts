export interface RankingParameters {
  priorMean: number;
  priorStrength: number;
}
export const INITIAL_RANKING_PARAMETERS: Readonly<RankingParameters> = {
  priorMean: 3.5,
  priorStrength: 10,
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
  score: number;
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
  recomputedAt: number;
}

// Used by ordinary writes and the full rebuild. SQL only persists these results.
export function aggregateFormula(
  categoryIds: readonly string[],
  ratings: readonly CanonicalRating[],
  triedUserIds: readonly string[],
  parameters: RankingParameters,
  now: number,
): CategoryAggregate[] {
  return categoryIds.map((categoryId) => {
    const counted = ratings.filter(
      (rating) => rating.categoryId === categoryId && rating.isCounted,
    );
    const ratingCount = counted.length;
    const ratingSum = counted.reduce((sum, rating) => sum + rating.score, 0);
    return {
      categoryId,
      ratingCount,
      ratingSum,
      ...scoreAggregate(ratingSum, ratingCount, parameters),
      triedCount: new Set(triedUserIds).size,
      recentRatingCount: counted.filter(
        (rating) => rating.createdAt >= now - 7 * 86400_000,
      ).length,
      recomputedAt: now,
    };
  });
}
