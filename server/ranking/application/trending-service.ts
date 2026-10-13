import {
  trendingScore,
  type PersonDay,
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
 * then each food's Trending lines are recomputed from daily statistics by
 * person. Top ranking data is never written here.
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
    // Older days in the window whose comments changed since the last pass.
    const since = await this.repository.lastRefresh();
    const changed = full
      ? []
      : await this.repository.changedCommentDays(
          since,
          today - this.span * DAY,
          today - DAY,
        );
    for (const day of changed) await this.repository.rollupDay(day);
    await this.repository.saveLastRefresh(now);
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
    return { days: days + changed.length, categories: categories.length };
  }
  /**
   * A category merge or reversal moves older activity between categories, so
   * re-derive the whole window, then recompute only the categories involved.
   */
  async refreshCategories(categoryIds: string[]) {
    const now = this.clock(),
      today = Math.floor(now / DAY) * DAY;
    for (let i = 0; i <= this.span; i++)
      await this.repository.rollupDay(today - i * DAY);
    for (const categoryId of new Set(categoryIds))
      await this.category(categoryId, now);
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
    const lines = new Map<string, PersonDay[]>();
    for (const row of rows)
      lines.set(row.familyId, [
        ...(lines.get(row.familyId) ?? []),
        {
          userId: row.userId,
          daysAgo: Math.round(
            (today - Date.parse(`${row.statDate}T00:00:00Z`)) / DAY,
          ),
          ratings: row.ratings,
          similaritySum: row.similaritySum,
          tried: row.tried === 1,
          commented: row.commented === 1,
        },
      ]);
    const scored = [...lines.entries()]
      .map(([familyId, days]) => ({
        familyId,
        ...trendingScore(days, this.params, this.ranking),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.familyId.localeCompare(b.familyId))
      .slice(0, this.params.limit);
    await this.repository.replaceTrends(
      categoryId,
      scored.map(({ familyId, score, inputs }) => ({
        familyId,
        score,
        inputs,
      })),
      now,
    );
  }
}
