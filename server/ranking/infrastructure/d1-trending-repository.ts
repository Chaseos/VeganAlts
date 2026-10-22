const DAY = 86_400_000;
export const statDate = (dayStart: number) =>
  new Date(dayStart).toISOString().slice(0, 10);

// A line's eligible flavors: current formulas of active products that aren't
// under review, ranking-eligible in an active rankable food.
const eligibleFlavor = (
  version: string,
) => `JOIN product_versions v ON v.id=${version} AND v.is_current=1
  JOIN products p ON p.id=v.product_id AND p.lifecycle_status='active' AND p.vegan_status<>'under_review'
  JOIN product_categories pc ON pc.product_id=p.id AND pc.ranking_eligible=1
  JOIN categories c ON c.id=pc.category_id AND c.is_active=1 AND c.is_rankable=1`;
const DAILY = `family_category_daily_stats(stat_date,product_family_id,category_id,user_id,rating_count,similarity_sum,tried,commented)`;

export interface ActivityRow {
  familyId: string;
  userId: string;
  statDate: string;
  ratings: number;
  similaritySum: number;
  tried: number;
  commented: number;
}

/** Derived, rebuildable discovery statistics; never canonical data. */
export class D1TrendingRepository {
  constructor(private readonly db: D1Database) {}
  /**
   * Re-derive one UTC day's activity by line, food and person from canonical
   * rows, atomically.
   */
  async rollupDay(dayStart: number) {
    const date = statDate(dayStart),
      end = dayStart + DAY;
    await this.db.batch([
      this.db
        .prepare("DELETE FROM family_category_daily_stats WHERE stat_date=?")
        .bind(date),
      this.db
        .prepare(
          `INSERT INTO ${DAILY}
          SELECT ?,p.product_family_id,r.category_id,r.user_id,COUNT(*),SUM(r.overall_similarity),0,0
          FROM ratings r ${eligibleFlavor("r.product_version_id")} AND pc.category_id=r.category_id
          WHERE r.is_counted=1 AND r.overall_similarity IS NOT NULL AND r.created_at>=? AND r.created_at<?
          GROUP BY p.product_family_id,r.category_id,r.user_id`,
        )
        .bind(date, dayStart, end),
      // Trials and comments describe the product, so they count toward each
      // eligible food (a comment tagged with a food counts only there).
      this.db
        .prepare(
          `INSERT INTO ${DAILY}
          SELECT ?,p.product_family_id,pc.category_id,x.user_id,0,0,1,0
          FROM product_trials x ${eligibleFlavor("x.product_version_id")}
          WHERE x.created_at>=? AND x.created_at<?
          GROUP BY p.product_family_id,pc.category_id,x.user_id
          ON CONFLICT(stat_date,product_family_id,category_id,user_id) DO UPDATE SET tried=1`,
        )
        .bind(date, dayStart, end),
      this.db
        .prepare(
          `INSERT INTO ${DAILY}
          SELECT ?,p.product_family_id,pc.category_id,x.user_id,0,0,0,1
          FROM comments x ${eligibleFlavor("x.product_version_id")}
          WHERE x.moderation_state='visible' AND x.deleted_at IS NULL AND (x.category_id IS NULL OR x.category_id=pc.category_id)
            AND x.created_at>=? AND x.created_at<?
          GROUP BY p.product_family_id,pc.category_id,x.user_id
          ON CONFLICT(stat_date,product_family_id,category_id,user_id) DO UPDATE SET commented=1`,
        )
        .bind(date, dayStart, end),
    ]);
  }
  async hasDailyStats() {
    return Boolean(
      await this.db
        .prepare("SELECT 1 FROM family_category_daily_stats LIMIT 1")
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
  /**
   * A food's daily activity by line and person since a date, for lines that
   * still have an eligible flavor there.
   */
  async activity(categoryId: string, since: string) {
    return (
      await this.db
        .prepare(
          `SELECT d.product_family_id AS familyId,d.user_id AS userId,d.stat_date AS statDate,d.rating_count AS ratings,
            d.similarity_sum AS similaritySum,d.tried,d.commented
          FROM family_category_daily_stats d
          JOIN family_category_stats s ON s.product_family_id=d.product_family_id AND s.category_id=d.category_id
          WHERE d.category_id=? AND d.stat_date>=?`,
        )
        .bind(categoryId, since)
        .all<ActivityRow>()
    ).results;
  }
  async replaceTrends(
    categoryId: string,
    rows: { familyId: string; score: number; inputs: unknown }[],
    now: number,
  ) {
    await this.db.batch([
      this.db
        .prepare("DELETE FROM family_category_trends WHERE category_id=?")
        .bind(categoryId),
      this.db
        .prepare(
          `INSERT INTO family_category_trends(category_id,product_family_id,trending_score,rank,inputs,computed_at)
          SELECT ?,json_extract(value,'$.familyId'),json_extract(value,'$.score'),key+1,json(json_extract(value,'$.inputs')),? FROM json_each(?)`,
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
