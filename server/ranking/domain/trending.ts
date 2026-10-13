import type { RankingParameters } from "./policy";

/**
 * Trending constants (RANKING §14, amended for recipe lines in milestone 7).
 * Trending looks back a quarter: people shop every week or two and may check
 * the site every month or two (owner, 2026-10-12). They are configuration,
 * not truth: recalibrate once real traffic exists.
 */
export const DEFAULT_TRENDING = {
  windowDays: 90,
  halfLifeDays: 30,
  baselineDays: 90,
  // People with a rating or trial in the window.
  minPeople: 3,
  limit: 200,
  trialWeight: 0.5,
  commentWeight: 0.25,
  newDays: 90,
  // The top lines in a food that carry the Trending tag in other views.
  taggedLines: 3,
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

/** One person's activity on a line in a food on one UTC day. */
export interface PersonDay {
  userId: string;
  daysAgo: number;
  // Counted ratings of the line's eligible flavors that day.
  ratings: number;
  similaritySum: number;
  tried: boolean;
  commented: boolean;
}
export interface TrendingResult {
  score: number;
  inputs: {
    recent: number;
    baseline: number;
    quality: number;
    people: number;
  };
}

interface Person {
  latest: number;
  weight: number;
  ratings: number;
  similaritySum: number;
  rated: boolean;
  tried: boolean;
}

/**
 * Each person counts once per period: on the day of their latest activity,
 * weighted by their heaviest kind of activity (a rating, then a trial, then a
 * comment), so rating three flavors on three days is one person, not three
 * events.
 */
function people(days: readonly PersonDay[], params: TrendingParameters) {
  const byUser = new Map<string, Person>();
  for (const day of days) {
    const weight =
      day.ratings > 0
        ? 1
        : day.tried
          ? params.trialWeight
          : day.commented
            ? params.commentWeight
            : 0;
    const person = byUser.get(day.userId) ?? {
      latest: day.daysAgo,
      weight: 0,
      ratings: 0,
      similaritySum: 0,
      rated: false,
      tried: false,
    };
    person.latest = Math.min(person.latest, day.daysAgo);
    person.weight = Math.max(person.weight, weight);
    person.ratings += day.ratings;
    person.similaritySum += day.similaritySum;
    person.rated ||= day.ratings > 0;
    person.tried ||= day.tried;
    byUser.set(day.userId, person);
  }
  return [...byUser.values()];
}

/**
 * Recent activity relative to the preceding quarter, weighted by how similar
 * recent raters found the line. Old activity fades through exponential decay;
 * sponsorship, moderation, trust and comment votes are never inputs.
 */
export function trendingScore(
  days: readonly PersonDay[],
  params: TrendingParameters,
  ranking: Pick<RankingParameters, "priorMean" | "priorStrength">,
): TrendingResult {
  const recentPeople = people(
    days.filter((d) => d.daysAgo >= 0 && d.daysAgo < params.windowDays),
    params,
  );
  const baselinePeople = people(
    days.filter(
      (d) =>
        d.daysAgo >= params.windowDays &&
        d.daysAgo < params.windowDays + params.baselineDays,
    ),
    params,
  );
  const recent = recentPeople.reduce(
    (sum, p) =>
      sum + p.weight * 0.5 ** (p.latest / Math.max(params.halfLifeDays, 1e-9)),
    0,
  );
  const baseline =
    baselinePeople.reduce((sum, p) => sum + p.weight, 0) /
    Math.max(params.baselineDays, 1);
  // Each rater's mean across the line's flavors in the window, then a
  // Bayesian mean over raters, normalized from the 1–5 scale to 0–1.
  const raters = recentPeople.filter((p) => p.ratings > 0);
  const meanSum = raters.reduce(
    (sum, p) => sum + p.similaritySum / p.ratings,
    0,
  );
  const mean =
    (meanSum + ranking.priorMean * ranking.priorStrength) /
    (raters.length + ranking.priorStrength);
  const quality = Math.min(1, Math.max(0, (mean - 1) / 4));
  const counted = recentPeople.filter((p) => p.rated || p.tried).length;
  const score =
    counted < params.minPeople
      ? 0
      : (recent / (baseline + 1)) * (0.5 + 0.5 * quality);
  return { score, inputs: { recent, baseline, quality, people: counted } };
}
