import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRENDING,
  trendingParameters,
  trendingScore,
  type DailyActivity,
} from "../../server/ranking/domain/trending";

const ranking = { priorMean: 3.5, priorStrength: 10 };
const day = (
  daysAgo: number,
  ratings: number,
  average = 4,
  extra: Partial<DailyActivity> = {},
): DailyActivity => ({
  daysAgo,
  ratings,
  ratingSum: ratings * average,
  trials: 0,
  commenters: 0,
  ...extra,
});

describe("trending score", () => {
  it("needs a minimum amount of recent activity", () => {
    expect(trendingScore([day(0, 2)], DEFAULT_TRENDING, ranking).score).toBe(0);
    expect(
      trendingScore([day(0, 3)], DEFAULT_TRENDING, ranking).score,
    ).toBeGreaterThan(0);
  });
  it("declines as activity ages and disappears outside the window", () => {
    const burst = (offset: number) =>
      trendingScore([day(offset, 6)], DEFAULT_TRENDING, ranking).score;
    expect(burst(0)).toBeGreaterThan(burst(3));
    expect(burst(3)).toBeGreaterThan(burst(6));
    expect(burst(7)).toBe(0);
  });
  it("compares recent activity with the preceding week's baseline", () => {
    const steady = trendingScore(
      [day(0, 3), ...Array.from({ length: 7 }, (_, i) => day(7 + i, 3))],
      DEFAULT_TRENDING,
      ranking,
    ).score;
    const rising = trendingScore([day(0, 3)], DEFAULT_TRENDING, ranking).score;
    expect(rising).toBeGreaterThan(steady);
  });
  it("weights by recent similarity quality and counts tries and discussion", () => {
    const close = trendingScore(
      [day(0, 5, 5)],
      DEFAULT_TRENDING,
      ranking,
    ).score;
    const far = trendingScore([day(0, 5, 1)], DEFAULT_TRENDING, ranking).score;
    expect(close).toBeGreaterThan(far);
    const discussed = trendingScore(
      [day(0, 3, 4, { trials: 2, commenters: 4 })],
      DEFAULT_TRENDING,
      ranking,
    ).score;
    expect(discussed).toBeGreaterThan(
      trendingScore([day(0, 3, 4)], DEFAULT_TRENDING, ranking).score,
    );
  });
  it("validates configuration", () => {
    expect(trendingParameters('{"halfLifeDays":2}').halfLifeDays).toBe(2);
    expect(() => trendingParameters('{"unknown":1}')).toThrow();
    expect(() => trendingParameters('{"windowDays":-1}')).toThrow();
  });
});
