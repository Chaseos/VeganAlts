import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRENDING,
  trendingParameters,
  trendingScore,
  type PersonDay,
} from "../../server/ranking/domain/trending";

const ranking = { priorMean: 3.5, priorStrength: 10 };
// People who each rated once on a day.
const raters = (
  daysAgo: number,
  count: number,
  similarity = 4,
  prefix = `d${daysAgo}`,
): PersonDay[] =>
  Array.from({ length: count }, (_, i) => ({
    userId: `${prefix}-${i}`,
    daysAgo,
    ratings: 1,
    similaritySum: similarity,
    tried: false,
    commented: false,
  }));
const score = (days: PersonDay[]) =>
  trendingScore(days, DEFAULT_TRENDING, ranking).score;

describe("trending score", () => {
  it("looks back a quarter against the quarter before", () => {
    expect(DEFAULT_TRENDING).toMatchObject({
      windowDays: 90,
      halfLifeDays: 30,
      baselineDays: 90,
      minPeople: 3,
    });
  });
  it("needs at least three people", () => {
    expect(score(raters(0, 2))).toBe(0);
    expect(score(raters(0, 3))).toBeGreaterThan(0);
  });
  it("counts each person once across the window", () => {
    // One person rating three flavors on three days is one person.
    const one = [0, 10, 20].map((daysAgo) => ({
      ...raters(daysAgo, 1, 4, "same")[0]!,
    }));
    expect(trendingScore(one, DEFAULT_TRENDING, ranking).inputs.people).toBe(1);
    expect(score([...one, ...raters(0, 1)])).toBe(0);
    // They count on the day of their latest activity.
    expect(
      trendingScore(one, DEFAULT_TRENDING, ranking).inputs.recent,
    ).toBeCloseTo(1);
  });
  it("declines as activity ages and disappears outside the window", () => {
    const burst = (offset: number) => score(raters(offset, 6));
    expect(burst(0)).toBeGreaterThan(burst(30));
    expect(burst(30)).toBeGreaterThan(burst(60));
    expect(burst(89)).toBeGreaterThan(0);
    expect(burst(90)).toBe(0);
  });
  it("compares recent people with the preceding quarter's baseline", () => {
    const steady = score([
      ...raters(0, 3),
      ...Array.from({ length: 90 }, (_, i) => raters(90 + i, 3)).flat(),
    ]);
    expect(score(raters(0, 3))).toBeGreaterThan(steady);
  });
  it("weights by raters' similarity and counts tries and discussion", () => {
    expect(score(raters(0, 5, 5))).toBeGreaterThan(score(raters(0, 5, 1)));
    const extra: PersonDay[] = [
      {
        ...raters(0, 1)[0]!,
        userId: "trier",
        ratings: 0,
        similaritySum: 0,
        tried: true,
      },
      {
        ...raters(0, 1)[0]!,
        userId: "talker",
        ratings: 0,
        similaritySum: 0,
        commented: true,
      },
    ];
    expect(score([...raters(0, 3), ...extra])).toBeGreaterThan(
      score(raters(0, 3)),
    );
    // A person who rated and commented counts once, as a rating.
    const both: PersonDay[] = [
      ...raters(0, 3),
      {
        ...raters(0, 1)[0]!,
        userId: "d0-0",
        ratings: 0,
        similaritySum: 0,
        commented: true,
      },
    ];
    expect(score(both)).toBe(score(raters(0, 3)));
    // Commenters alone never make a line trend.
    expect(
      score(
        ["a", "b", "c"].map((userId) => ({
          ...raters(0, 1)[0]!,
          userId,
          ratings: 0,
          similaritySum: 0,
          commented: true,
        })),
      ),
    ).toBe(0);
  });
  it("validates configuration", () => {
    expect(trendingParameters('{"halfLifeDays":2}').halfLifeDays).toBe(2);
    expect(() => trendingParameters('{"unknown":1}')).toThrow();
    expect(() => trendingParameters('{"windowDays":-1}')).toThrow();
  });
});
