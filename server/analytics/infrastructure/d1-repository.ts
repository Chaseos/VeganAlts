import type {
  ProductAnalytics,
  ProductAnalyticsQuery,
  ProductAnalyticsRepository,
  ProductAnalyticsSort,
} from "../domain/contracts";

const ORDER: Record<ProductAnalyticsSort, string> = {
  views: "views DESC,saves DESC,ratings DESC",
  saves: "saves DESC,ratings DESC,views DESC",
  ratings: "ratings DESC,saves DESC,views DESC",
};

const likeTerm = (value: string) =>
  `%${value.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;

export class D1ProductAnalyticsRepository implements ProductAnalyticsRepository {
  constructor(private readonly db: D1Database) {}
  // The SELECT skips an unknown or hidden ID, so a stray request stores nothing.
  async addView(productId: string, statDate: string) {
    await this.db
      .prepare(
        `INSERT INTO product_view_days (product_id,stat_date,views)
        SELECT id,?,1 FROM products WHERE id=? AND lifecycle_status<>'hidden'
        ON CONFLICT(product_id,stat_date) DO UPDATE SET views=views+1`,
      )
      .bind(statDate, productId)
      .run();
  }
  // A private operator report, so reading raw ratings here is fine; public
  // pages keep reading aggregates. Views and saves of an archived duplicate
  // follow its surviving product, as the saved list does. Ratings stay with
  // the donor because consolidation doesn't transfer them.
  async report(query: ProductAnalyticsQuery) {
    const term = likeTerm(query.search);
    const { results } = await this.db
      .prepare(
        `WITH viewed AS (
          SELECT COALESCE(d.survivor_id,v.product_id) AS product_id,SUM(v.views) AS views,
            SUM(CASE WHEN v.stat_date>=? THEN v.views ELSE 0 END) AS recent
          FROM product_view_days v
          LEFT JOIN duplicate_consolidations d ON d.donor_id=v.product_id AND d.active=1
          GROUP BY 1
        ),saved AS (
          SELECT COALESCE(d.survivor_id,s.product_id) AS product_id,COUNT(DISTINCT s.user_id) AS people
          FROM saved_products s
          LEFT JOIN duplicate_consolidations d ON d.donor_id=s.product_id AND d.active=1
          GROUP BY 1
        ),rated AS (
          SELECT pv.product_id,COUNT(DISTINCT r.user_id) AS people
          FROM ratings r JOIN product_versions pv ON pv.id=r.product_version_id
          WHERE r.is_counted=1
          GROUP BY 1
        )
        SELECT p.id,p.slug,lower(country.iso2) AS country,p.name,b.name AS brand,p.flavor,p.lifecycle_status AS lifecycleStatus,
          COALESCE(viewed.views,0) AS views,COALESCE(viewed.recent,0) AS recentViews,
          COALESCE(saved.people,0) AS saves,COALESCE(rated.people,0) AS ratings
        FROM products p
        JOIN countries country ON country.id=p.country_id
        LEFT JOIN brands b ON b.id=p.brand_id
        LEFT JOIN viewed ON viewed.product_id=p.id
        LEFT JOIN saved ON saved.product_id=p.id
        LEFT JOIN rated ON rated.product_id=p.id
        WHERE p.lifecycle_status<>'hidden'
          ${query.search ? "AND (p.name LIKE ? ESCAPE '\\' OR b.name LIKE ? ESCAPE '\\' OR p.flavor LIKE ? ESCAPE '\\')" : ""}
        ORDER BY ${ORDER[query.sort]},p.name,p.id
        LIMIT ? OFFSET ?`,
      )
      .bind(
        query.recentFrom,
        ...(query.search ? [term, term, term] : []),
        query.limit,
        query.offset,
      )
      .all<ProductAnalytics>();
    return results;
  }
}
