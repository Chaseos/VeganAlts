import type { RankingParameters } from "./policy";

/**
 * Provisional Trending constants (RANKING §14 and the Milestone 4 decisions).
 * They are configuration, not truth: recalibrate once real traffic exists.
 */
export const DEFAULT_TRENDING = {
  windowDays: 7,
  halfLifeDays: 3,
  baselineDays: 7,
  minEvents: 3,
  limit: 200,
  trialWeight: 0.5,
  commentWeight: 0.25,
  newDays: 90,
};
export type TrendingParameters = typeof DEFAULT_TRENDING;
export function trendingParameters(value?: string): TrendingParameters {
  if (!value) return { ...DEFAULT_TRENDING };
  const overrides: unknown = JSON.parse(value);
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Invalid trending parameters.");
  const result = { ...DEFAULT_TRENDING };
  for (const [name, raw] of Object.entries(overrides)) {
    if (!(name in result) || typeof raw !== "number" || !(raw >= 0))
      throw new Error("Invalid trending parameter.");
    result[name as keyof TrendingParameters] = raw;
  }
  return result;
}

/** One UTC day of canonical activity for a formula in a category. */
export interface DailyActivity {
  daysAgo: number;
  ratings: number;
  ratingSum: number;
  trials: number;
  commenters: number;
}
export interface TrendingResult {
  score: number;
  inputs: {
    recent: number;
    baseline: number;
    quality: number;
    events: number;
  };
}

/**
 * Recent activity relative to the preceding week, weighted by how similar
 * recent raters found the product. Old bursts fade through exponential decay;
 * sponsorship, moderation, trust and comment votes are never inputs.
 */
export function trendingScore(
  days: DailyActivity[],
  params: TrendingParameters,
  ranking: Pick<RankingParameters, "priorMean" | "priorStrength">,
): TrendingResult {
  const activity = (d: DailyActivity) =>
    d.ratings +
    params.trialWeight * d.trials +
    params.commentWeight * d.commenters;
  const recentDays = days.filter(
    (d) => d.daysAgo >= 0 && d.daysAgo < params.windowDays,
  );
  const baselineDays = days.filter(
    (d) =>
      d.daysAgo >= params.windowDays &&
      d.daysAgo < params.windowDays + params.baselineDays,
  );
  const recent = recentDays.reduce(
    (sum, d) =>
      sum +
      activity(d) * 0.5 ** (d.daysAgo / Math.max(params.halfLifeDays, 1e-9)),
    0,
  );
  const baseline =
    baselineDays.reduce((sum, d) => sum + activity(d), 0) /
    Math.max(params.baselineDays, 1);
  const count = recentDays.reduce((sum, d) => sum + d.ratings, 0),
    total = recentDays.reduce((sum, d) => sum + d.ratingSum, 0);
  // Bayesian mean of recent similarity, normalized from the 1–5 scale to 0–1.
  const mean =
    (total + ranking.priorMean * ranking.priorStrength) /
    (count + ranking.priorStrength);
  const quality = Math.min(1, Math.max(0, (mean - 1) / 4));
  const events = recentDays.reduce((sum, d) => sum + d.ratings + d.trials, 0);
  const score =
    events < params.minEvents
      ? 0
      : (recent / (baseline + 1)) * (0.5 + 0.5 * quality);
  return { score, inputs: { recent, baseline, quality, events } };
}
