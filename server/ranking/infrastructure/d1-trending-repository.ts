const DAY = 86_400_000;
export const statDate = (dayStart: number) =>
  new Date(dayStart).toISOString().slice(0, 10);

// Only eligible current formulas in active rankable categories take part.
const eligibleMembership = `JOIN product_versions v ON v.id=x.product_version_id
  JOIN product_categories pc ON pc.product_id=v.product_id AND pc.ranking_eligible=1
  JOIN categories c ON c.id=pc.category_id AND c.is_active=1 AND c.is_rankable=1`;

export interface ActivityRow {
  versionId: string;
  productId: string;
  statDate: string;
  ratings: number;
  ratingSum: number;
  trials: number;
  commenters: number;
}

/** Derived, rebuildable discovery statistics; never canonical data. */
export class D1TrendingRepository {
  constructor(private readonly db: D1Database) {}
  /** Re-derive one UTC day's statistics from canonical rows, atomically. */
  async rollupDay(dayStart: number) {
    const date = statDate(dayStart),
      end = dayStart + DAY;
    await this.db.batch([
      this.db
        .prepare("DELETE FROM product_category_daily_stats WHERE stat_date=?")
        .bind(date),
      this.db
        .prepare(
          `INSERT INTO product_category_daily_stats(stat_date,product_version_id,category_id,new_rating_count,rating_sum,new_trial_count,comment_count)
          SELECT ?,r.product_version_id,r.category_id,COUNT(*),SUM(r.overall_similarity),0,0 FROM ratings r
          JOIN categories c ON c.id=r.category_id AND c.is_active=1 AND c.is_rankable=1
          WHERE r.is_counted=1 AND r.created_at>=? AND r.created_at<? GROUP BY r.product_version_id,r.category_id`,
        )
        .bind(date, dayStart, end),
      // Trials and comments describe the product, so they count toward each
      // eligible category (a comment tagged with a category counts only there).
      this.db
        .prepare(
          `INSERT INTO product_category_daily_stats(stat_date,product_version_id,category_id,new_rating_count,rating_sum,new_trial_count,comment_count)
          SELECT ?,x.product_version_id,pc.category_id,0,0,COUNT(*),0 FROM product_trials x ${eligibleMembership}
          WHERE x.created_at>=? AND x.created_at<? GROUP BY x.product_version_id,pc.category_id
          ON CONFLICT(stat_date,product_version_id,category_id) DO UPDATE SET new_trial_count=excluded.new_trial_count`,
        )
        .bind(date, dayStart, end),
      this.db
        .prepare(
          `INSERT INTO product_category_daily_stats(stat_date,product_version_id,category_id,new_rating_count,rating_sum,new_trial_count,comment_count)
          SELECT ?,x.product_version_id,pc.category_id,0,0,0,COUNT(DISTINCT x.user_id) FROM comments x ${eligibleMembership}
          WHERE x.moderation_state='visible' AND x.deleted_at IS NULL AND (x.category_id IS NULL OR x.category_id=pc.category_id)
          AND x.created_at>=? AND x.created_at<? GROUP BY x.product_version_id,pc.category_id
          ON CONFLICT(stat_date,product_version_id,category_id) DO UPDATE SET comment_count=excluded.comment_count`,
        )
        .bind(date, dayStart, end),
    ]);
  }
  async hasDailyStats() {
    return Boolean(
      await this.db
        .prepare("SELECT 1 FROM product_category_daily_stats LIMIT 1")
        .first(),
    );
  }
  async categoriesAfter(cursor: string, limit: number) {
    return (
      await this.db
        .prepare(
          "SELECT id FROM categories WHERE is_active=1 AND is_rankable=1 AND id>? ORDER BY id LIMIT ?",
        )
        .bind(cursor, limit)
        .all<{ id: string }>()
    ).results.map((r) => r.id);
  }
  /** Daily rows for eligible current formulas in one category since a date. */
  async activity(categoryId: string, since: string) {
    return (
      await this.db
        .prepare(
          `SELECT d.product_version_id AS versionId,p.id AS productId,d.stat_date AS statDate,d.new_rating_count AS ratings,d.rating_sum AS ratingSum,d.new_trial_count AS trials,d.comment_count AS commenters
          FROM product_category_daily_stats d JOIN product_versions v ON v.id=d.product_version_id AND v.is_current=1
          JOIN products p ON p.id=v.product_id AND p.lifecycle_status='active' AND p.vegan_status<>'under_review'
          JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=d.category_id AND pc.ranking_eligible=1
          WHERE d.category_id=? AND d.stat_date>=?`,
        )
        .bind(categoryId, since)
        .all<ActivityRow>()
    ).results;
  }
  async replaceTrends(
    categoryId: string,
    rows: {
      versionId: string;
      productId: string;
      score: number;
      inputs: unknown;
    }[],
    now: number,
  ) {
    await this.db.batch([
      this.db
        .prepare("DELETE FROM product_category_trends WHERE category_id=?")
        .bind(categoryId),
      this.db
        .prepare(
          `INSERT INTO product_category_trends(category_id,product_version_id,product_id,trending_score,inputs,computed_at)
          SELECT ?,json_extract(value,'$.versionId'),json_extract(value,'$.productId'),json_extract(value,'$.score'),json(json_extract(value,'$.inputs')),? FROM json_each(?)`,
        )
        .bind(categoryId, now, JSON.stringify(rows)),
    ]);
  }
  /**
   * UTC day starts, in [from, to), of comments changed since a time. A delete,
   * hide, restore or release can change an older day's distinct commenters.
   */
  async changedCommentDays(since: number, from: number, to: number) {
    return (
      await this.db
        .prepare(
          "SELECT DISTINCT (created_at/86400000)*86400000 AS day FROM comments WHERE created_at>=? AND created_at<? AND updated_at>=?",
        )
        .bind(from, to, since)
        .all<{ day: number }>()
    ).results.map((r) => r.day);
  }
  async lastRefresh() {
    return Number(
      (await this.db
        .prepare(
          "SELECT cursor FROM community_recovery WHERE prefix='trending-refreshed'",
        )
        .first<string>("cursor")) ?? 0,
    );
  }
  async saveLastRefresh(at: number) {
    await this.db
      .prepare(
        "INSERT INTO community_recovery(prefix,cursor) VALUES('trending-refreshed',?) ON CONFLICT(prefix) DO UPDATE SET cursor=excluded.cursor",
      )
      .bind(String(at))
      .run();
  }
  async cursor() {
    return (
      (await this.db
        .prepare(
          "SELECT cursor FROM community_recovery WHERE prefix='trending'",
        )
        .first<string>("cursor")) ?? ""
    );
  }
  async saveCursor(cursor: string) {
    await this.db
      .prepare(
        "INSERT INTO community_recovery(prefix,cursor) VALUES('trending',?) ON CONFLICT(prefix) DO UPDATE SET cursor=excluded.cursor",
      )
      .bind(cursor)
      .run();
  }
}
