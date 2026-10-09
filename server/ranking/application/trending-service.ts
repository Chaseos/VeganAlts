import {
  trendingScore,
  type DailyActivity,
  type TrendingParameters,
} from "../domain/trending";
import type { RankingParameters } from "../domain/policy";
import {
  statDate,
  type D1TrendingRepository,
} from "../infrastructure/d1-trending-repository";

const DAY = 86_400_000;
const CATEGORIES_PER_PASS = 50;

/**
 * Hourly discovery refresh. Recent days are re-derived from canonical rows,
 * then each category's Trending list is recomputed from daily statistics.
 * Top ranking data is never read or written here.
 */
export class TrendingService {
  constructor(
    private readonly repository: D1TrendingRepository,
    private readonly params: TrendingParameters,
    private readonly ranking: Pick<
      RankingParameters,
      "priorMean" | "priorStrength"
    >,
    private readonly clock = Date.now,
  ) {}
  private get span() {
    return this.params.windowDays + this.params.baselineDays;
  }
  async refresh() {
    const now = this.clock(),
      today = Math.floor(now / DAY) * DAY;
    // The full window is re-derived once a day or when nothing exists yet;
    // other passes refresh today and yesterday.
    const full =
      new Date(now).getUTCHours() === 0 ||
      !(await this.repository.hasDailyStats());
    const days = full ? this.span + 1 : 2;
    for (let i = 0; i < days; i++)
      await this.repository.rollupDay(today - i * DAY);
    let cursor = await this.repository.cursor();
    let categories = await this.repository.categoriesAfter(
      cursor,
      CATEGORIES_PER_PASS,
    );
    if (!categories.length && cursor)
      categories = await this.repository.categoriesAfter(
        "",
        CATEGORIES_PER_PASS,
      );
    for (const category of categories) await this.category(category, now);
    cursor = categories.at(-1) ?? "";
    await this.repository.saveCursor(
      categories.length < CATEGORIES_PER_PASS ? "" : cursor,
    );
    return { days, categories: categories.length };
  }
  /** Rebuild every day in the window and every category. */
  async rebuild() {
    const now = this.clock(),
      today = Math.floor(now / DAY) * DAY;
    for (let i = 0; i <= this.span; i++)
      await this.repository.rollupDay(today - i * DAY);
    let cursor = "",
      total = 0;
    for (;;) {
      const page = await this.repository.categoriesAfter(cursor, 100);
      for (const category of page) await this.category(category, now);
      total += page.length;
      if (page.length < 100) break;
      cursor = page.at(-1)!;
    }
    return { days: this.span + 1, categories: total };
  }
  private async category(categoryId: string, now: number) {
    const today = Math.floor(now / DAY) * DAY;
    const rows = await this.repository.activity(
      categoryId,
      statDate(today - (this.span - 1) * DAY),
    );
    const formulas = new Map<
      string,
      { productId: string; days: DailyActivity[] }
    >();
    for (const row of rows) {
      const entry = formulas.get(row.versionId) ?? {
        productId: row.productId,
        days: [],
      };
      entry.days.push({
        daysAgo: Math.round(
          (today - Date.parse(`${row.statDate}T00:00:00Z`)) / DAY,
        ),
        ratings: row.ratings,
        ratingSum: row.ratingSum,
        trials: row.trials,
        commenters: row.commenters,
      });
      formulas.set(row.versionId, entry);
    }
    const scored = [...formulas.entries()]
      .map(([versionId, { productId, days }]) => ({
        versionId,
        productId,
        ...trendingScore(days, this.params, this.ranking),
      }))
      .filter((r) => r.score > 0)
      .sort(
        (a, b) => b.score - a.score || a.productId.localeCompare(b.productId),
      )
      .slice(0, this.params.limit);
    await this.repository.replaceTrends(
      categoryId,
      scored.map((r) => ({
        versionId: r.versionId,
        productId: r.productId,
        score: r.score,
        inputs: r.inputs,
      })),
      now,
    );
  }
}
