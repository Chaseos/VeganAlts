import { resolveCategoryRedirect } from "../../taxonomy/infrastructure/redirects";
import type {
  CatalogRepository,
  CategorySummary,
  DiscoveryRow,
  FormulaSummary,
  ProductCategory,
  ProductDetails,
  ProductSummary,
  PublicProfile,
  RankingRow,
} from "../domain/contracts";
import {
  eligibleProductSql as eligible,
  rankedMembershipSql,
  rankedSampleSql,
  rankingOrderSql,
} from "../../ranking/infrastructure/read-policy";
import {
  communityProductDetails,
  communityProductStatements,
  readCanonicalRedirect,
} from "../../community/infrastructure/public-read";

const identity = `p.id,p.slug,p.name,b.name AS brand,v.id AS versionId,p.development_only AS developmentOnly,p.published_at AS publishedAt,
  (SELECT i.id FROM product_images i WHERE i.product_version_id=v.id AND i.slot='front' AND i.state='accepted' LIMIT 1) AS imageId`;
const productJoins = `JOIN products p ON p.id=v.product_id JOIN countries country ON country.id=p.country_id AND country.iso2='US' AND country.is_active=1 LEFT JOIN brands b ON b.id=p.brand_id`;
const visible = `p.lifecycle_status <> 'hidden'`;
const categoryFields = `c.id,c.slug,c.name,c.parent_id AS parentId,c.is_rankable AS isRankable,
 (SELECT COUNT(*) FROM product_categories pc JOIN products p ON p.id=pc.product_id JOIN countries country ON country.id=p.country_id WHERE pc.category_id=c.id AND country.iso2='US' AND country.is_active=1 AND ${visible}) AS productCount`;

export class D1CatalogRepository implements CatalogRepository {
  constructor(private readonly db: D1Database) {}

  async categories(parentId?: string) {
    return (
      await this.db
        .prepare(
          `SELECT ${categoryFields} FROM categories c WHERE c.is_active=1 AND ${parentId ? "c.parent_id=?" : "c.is_rankable=1"} ORDER BY c.name LIMIT 100`,
        )
        .bind(...(parentId ? [parentId] : []))
        .all<CategorySummary>()
    ).results;
  }

  async featuredCategories() {
    return (
      await this.db
        .prepare(
          `SELECT ${categoryFields} FROM category_features f JOIN countries co ON co.id=f.country_id AND co.iso2='US'
          JOIN categories c ON c.id=f.category_id AND c.is_active=1 ORDER BY f.position LIMIT 12`,
        )
        .all<CategorySummary>()
    ).results;
  }

  categoryRedirect(slug: string) {
    return resolveCategoryRedirect(this.db, slug);
  }

  category(slug: string) {
    return this.db
      .prepare(
        `SELECT ${categoryFields} FROM categories c WHERE c.slug=? AND c.is_active=1`,
      )
      .bind(slug)
      .first<CategorySummary>();
  }

  async rankings(categoryId: string, offset: number, limit: number) {
    return (
      await this.db
        .prepare(
          `SELECT ${identity},s.bayesian_score AS bayesianScore,s.rating_count AS ratingCount
      FROM product_category_stats s JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1 ${productJoins}
      ${rankedMembershipSql}
      WHERE s.category_id=? AND ${eligible} AND ${rankedSampleSql}
      ORDER BY ${rankingOrderSql} LIMIT ? OFFSET ?`,
        )
        .bind(categoryId, limit, offset)
        .all<RankingRow>()
    ).results;
  }

  // Trending reads the precomputed trends read model, never raw ratings.
  async trending(categoryId: string | null, offset: number, limit: number) {
    return (
      await this.db
        .prepare(
          `SELECT ${identity},${categoryId ? "s.bayesian_score" : "NULL"} AS bayesianScore,${categoryId ? "COALESCE(s.rating_count,0)" : "0"} AS ratingCount
      FROM product_category_trends t JOIN product_versions v ON v.id=t.product_version_id AND v.is_current=1 ${productJoins}
      JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=t.category_id AND pc.ranking_eligible=1
      JOIN categories c ON c.id=t.category_id AND c.is_active=1 AND c.is_rankable=1
      LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=t.category_id
      WHERE ${categoryId ? "t.category_id=? AND" : ""} t.trending_score>0 AND ${eligible}
      ${categoryId ? "" : "GROUP BY p.id"}
      ORDER BY ${categoryId ? "t.trending_score" : "MAX(t.trending_score)"} DESC,p.id LIMIT ? OFFSET ?`,
        )
        .bind(...(categoryId ? [categoryId] : []), limit, offset)
        .all<DiscoveryRow>()
    ).results;
  }

  // New is chronological discovery of recently published, eligible products.
  async newest(
    categoryId: string | null,
    since: number,
    offset: number,
    limit: number,
  ) {
    return (
      await this.db
        .prepare(
          `SELECT ${identity},${categoryId ? "s.bayesian_score" : "NULL"} AS bayesianScore,${categoryId ? "COALESCE(s.rating_count,0)" : "0"} AS ratingCount
      FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
      JOIN countries country ON country.id=p.country_id AND country.iso2='US' AND country.is_active=1 LEFT JOIN brands b ON b.id=p.brand_id
      ${categoryId ? "JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=? AND pc.ranking_eligible=1 LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=pc.category_id" : ""}
      WHERE p.published_at>=? AND ${eligible}
      ORDER BY p.published_at DESC,p.id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...(categoryId ? [categoryId] : []), since, limit, offset)
        .all<DiscoveryRow>()
    ).results;
  }

  async unranked(categoryId: string, offset: number, limit: number) {
    return (
      await this.db
        .prepare(
          `SELECT ${identity} FROM product_categories pc
      JOIN product_versions v ON v.product_id=pc.product_id AND v.is_current=1 ${productJoins}
      LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=pc.category_id
      WHERE pc.category_id=? AND pc.ranking_eligible=1 AND ${eligible} AND COALESCE(s.rating_count,0)=0
      ORDER BY p.name,p.id LIMIT ? OFFSET ?`,
        )
        .bind(categoryId, limit, offset)
        .all<ProductSummary>()
    ).results;
  }

  async product(
    slug: string,
    versionId: string | null,
  ): Promise<ProductDetails | null> {
    const row = await this.db
      .prepare(
        `SELECT ${identity},country.name AS country,p.vegan_status AS veganStatus,p.manufacturer_label AS manufacturerLabel,p.lifecycle_status AS lifecycleStatus,p.data_notes AS dataNotes
      FROM product_versions v ${productJoins} WHERE p.slug=? AND ${visible} AND ${versionId ? "v.id=?" : "v.is_current=1"}`,
      )
      .bind(slug, ...(versionId ? [versionId] : []))
      .first<
        Omit<ProductDetails, "formula" | "categories" | "history" | "images">
      >();
    if (!row) return null;
    const now = Date.now();
    const [history, categories, images, ...community] = await this.db.batch([
      this.db
        .prepare(
          `SELECT id,version_label AS versionLabel,is_current AS isCurrent,change_summary AS changeSummary,effective_from AS effectiveFrom,effective_date AS effectiveDate,effective_date_precision AS effectiveDatePrecision FROM product_versions WHERE product_id=? ORDER BY is_current DESC,created_at DESC,id LIMIT 100`,
        )
        .bind(row.id),
      this.db
        .prepare(
          `SELECT c.id,c.slug,c.name,c.is_active AS isActive,CASE WHEN pc.ranking_eligible=1 AND c.is_active=1 AND c.is_rankable=1 AND ${eligible} AND v.is_current=1 THEN 1 ELSE 0 END AS canRate,s.bayesian_score AS bayesianScore,COALESCE(s.rating_count,0) AS ratingCount
        FROM product_categories pc JOIN categories c ON c.id=pc.category_id JOIN products p ON p.id=pc.product_id JOIN product_versions v ON v.product_id=p.id AND v.id=? LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=c.id WHERE pc.product_id=? AND (c.is_active=1 OR v.is_current=0) ORDER BY c.name LIMIT 50`,
        )
        .bind(row.versionId, row.id),
      this.db
        .prepare(
          `SELECT id,slot,CASE WHEN evidence_r2_key IS NOT NULL THEN 1 ELSE 0 END AS hasEvidence FROM product_images WHERE product_version_id=? AND state='accepted' ORDER BY slot LIMIT 5`,
        )
        .bind(row.versionId),
      ...communityProductStatements(this.db, row.id, row.versionId, now),
    ]);
    const formulas = history!.results as unknown as FormulaSummary[];
    // A requested older version need not be among the newest 100 history links.
    const formula =
      formulas.find((item) => item.id === row.versionId) ??
      (await this.db
        .prepare(
          `SELECT id,version_label AS versionLabel,is_current AS isCurrent,change_summary AS changeSummary,effective_from AS effectiveFrom,effective_date AS effectiveDate,effective_date_precision AS effectiveDatePrecision FROM product_versions WHERE id=?`,
        )
        .bind(row.versionId)
        .first<FormulaSummary>());
    if (!formula) return null;
    const details = communityProductDetails(
      community as D1Result<Record<string, unknown>>[],
      now,
    );
    return {
      ...row,
      ...details,
      veganStatus:
        details.classification?.veganStatus ??
        (formula.isCurrent ? row.veganStatus : "not_recorded"),
      manufacturerLabel:
        details.classification?.manufacturerLabel ??
        (formula.isCurrent ? row.manufacturerLabel : "unknown"),
      formula,
      history: formulas,
      categories: categories!.results as unknown as ProductCategory[],
      images: images!.results as unknown as ProductDetails["images"],
    };
  }

  async search(expression: string) {
    const [categories, products] = await this.db.batch([
      this.db
        .prepare(
          `SELECT ${categoryFields} FROM search_index JOIN categories c ON c.id=search_index.entity_id AND c.is_active=1 WHERE search_index MATCH ? AND entity_type='category' AND country_code='US' ORDER BY rank,c.name LIMIT 12`,
        )
        .bind(expression),
      this.db
        .prepare(
          `SELECT ${identity} FROM search_index JOIN product_versions v ON v.product_id=search_index.entity_id AND v.is_current=1 ${productJoins} WHERE search_index MATCH ? AND entity_type='product' AND country_code='US' AND p.lifecycle_status<>'discontinued' AND ${visible} ORDER BY rank,p.name,p.id LIMIT 20`,
        )
        .bind(expression),
    ]);
    return {
      categories: categories!.results as unknown as CategorySummary[],
      products: products!.results as unknown as ProductSummary[],
    };
  }

  canonicalRedirect(slug: string) {
    return readCanonicalRedirect(this.db, slug);
  }

  profile(handle: string) {
    return this.db
      .prepare(
        `SELECT pr.handle,pr.display_name AS displayName,
      (SELECT COUNT(*) FROM ratings r JOIN product_versions v ON v.id=r.product_version_id JOIN products p ON p.id=v.product_id WHERE r.user_id=pr.user_id AND r.is_counted=1 AND p.lifecycle_status<>'hidden') AS ratingCount,
      (SELECT COUNT(*) FROM product_trials t JOIN product_versions v ON v.id=t.product_version_id JOIN products p ON p.id=v.product_id WHERE t.user_id=pr.user_id AND p.lifecycle_status<>'hidden') AS triedCount
      FROM profiles pr WHERE pr.handle=? AND pr.account_state='active'`,
      )
      .bind(handle)
      .first<PublicProfile>();
  }
}
