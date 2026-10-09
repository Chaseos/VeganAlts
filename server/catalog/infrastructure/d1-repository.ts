import { resolveCategoryRedirect } from "../../taxonomy/infrastructure/redirects";
import type {
  CatalogRepository,
  CategorySummary,
  DiscoveryRow,
  FormulaSummary,
  HomeProduct,
  MarketRow,
  ProductCategory,
  ProductDetails,
  ProductPlacement,
  ProductSummary,
  PublicProfile,
  RankedRow,
  RankingRow,
  StoreOption,
  TaxonomyCounts,
  TopProduct,
} from "../domain/contracts";
import type { RankingFilters } from "../domain/filters";
import type { AllergenDeclaration } from "../../community/domain/allergens";
import type { TaxonomyNode } from "../../taxonomy/domain/shape";
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
// Every catalog read is scoped to one active country, bound as its ID.
const productJoins = `JOIN products p ON p.id=v.product_id AND p.country_id=? JOIN countries country ON country.id=p.country_id AND country.is_active=1 LEFT JOIN brands b ON b.id=p.brand_id`;
const visible = `p.lifecycle_status <> 'hidden'`;
// A food's name in a country: its display-name alias there, else its name.
const displayName = (category: string, country = "?") =>
  `COALESCE((SELECT d.alias FROM category_aliases d WHERE d.category_id=${category}.id AND d.country_id=${country} AND d.is_display_name=1),${category}.name)`;
// A formula's allergen declaration as JSON, or NULL when none is confirmed.
const allergensSql = (version = "v") =>
  `(SELECT json_object('status',d.status,
    'contains',json((SELECT json_group_array(a.allergen_key) FROM product_version_allergens a WHERE a.product_version_id=d.product_version_id AND a.presence='contains')),
    'mayContain',json((SELECT json_group_array(a.allergen_key) FROM product_version_allergens a WHERE a.product_version_id=d.product_version_id AND a.presence='may_contain')))
    FROM product_version_allergen_declarations d WHERE d.product_version_id=${version}.id)`;
function parseAllergens<T extends { allergens?: unknown }>(row: T) {
  return {
    ...row,
    allergens:
      typeof row.allergens === "string"
        ? (JSON.parse(row.allergens) as AllergenDeclaration)
        : null,
  };
}
// Binds the country ID twice: display name, then product count.
const categoryFields = `c.id,c.slug,${displayName("c")} AS name,c.parent_id AS parentId,c.is_rankable AS isRankable,
 (SELECT COUNT(*) FROM product_categories pc JOIN products p ON p.id=pc.product_id WHERE pc.category_id=c.id AND p.country_id=? AND ${visible}) AS productCount`;

interface Fragment {
  sql: string;
  binds: unknown[];
}

// Ranking filters only narrow a view. A product qualifies for the store
// filter when an active report places it at any chosen store in an active
// market of its own country (OR across stores). Free-from requires a confirmed
// declaration naming none of the chosen allergens.
function filterSql(
  filters: RankingFilters,
  product = "p",
  version = "v",
): Fragment {
  const parts: string[] = [];
  const binds: unknown[] = [];
  if (filters.stores.length) {
    parts.push(`EXISTS(SELECT 1 FROM product_retailers pr JOIN retailers r ON r.id=pr.retailer_id
      JOIN products fp ON fp.id=pr.product_id
      JOIN retailer_markets m ON m.retailer_id=pr.retailer_id AND m.country_id=fp.country_id AND m.is_active=1
      WHERE pr.product_id=${product}.id AND pr.status='active' AND r.slug IN (SELECT value FROM json_each(?)))`);
    binds.push(JSON.stringify(filters.stores));
  }
  if (filters.freeFrom.length) {
    parts.push(`EXISTS(SELECT 1 FROM product_version_allergen_declarations d WHERE d.product_version_id=${version}.id)
      AND NOT EXISTS(SELECT 1 FROM product_version_allergens a WHERE a.product_version_id=${version}.id AND a.allergen_key IN (SELECT value FROM json_each(?)))`);
    binds.push(JSON.stringify(filters.freeFrom));
  }
  return { sql: parts.length ? ` AND ${parts.join(" AND ")}` : "", binds };
}

// The chosen stores where a listed product is commonly found (active reports).
function matchedStoresSql(filters: RankingFilters, product = "p"): Fragment {
  if (!filters.stores.length)
    return { sql: ",NULL AS matchedStores", binds: [] };
  return {
    sql: `,(SELECT json_group_array(r.slug) FROM product_retailers pr JOIN retailers r ON r.id=pr.retailer_id
      JOIN products fp ON fp.id=pr.product_id
      JOIN retailer_markets m ON m.retailer_id=pr.retailer_id AND m.country_id=fp.country_id AND m.is_active=1
      WHERE pr.product_id=${product}.id AND pr.status='active' AND r.slug IN (SELECT value FROM json_each(?))) AS matchedStores`,
    binds: [JSON.stringify(filters.stores)],
  };
}

function parseStores<T extends { matchedStores?: unknown }>(rows: T[]) {
  return rows.map((row) => ({
    ...row,
    matchedStores:
      typeof row.matchedStores === "string"
        ? (JSON.parse(row.matchedStores) as string[]).sort()
        : [],
  }));
}

export class D1CatalogRepository implements CatalogRepository {
  constructor(private readonly db: D1Database) {}

  async markets() {
    return (
      await this.db
        .prepare(
          `SELECT co.id,co.iso2,co.name,EXISTS(SELECT 1 FROM product_category_stats s JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1
            JOIN products p ON p.id=v.product_id AND p.country_id=co.id ${rankedMembershipSql}
            WHERE ${eligible} AND ${rankedSampleSql}) AS hasRankings
          FROM countries co WHERE co.is_active=1 ORDER BY CASE WHEN co.iso2='US' THEN 0 ELSE 1 END,co.name LIMIT 300`,
        )
        .all<MarketRow>()
    ).results;
  }

  // Every active category plus per-food counts for one country: the aisle
  // tree is shaped from these in the domain.
  async taxonomy(countryId: string) {
    const [categories, counts] = await this.db.batch([
      this.db
        .prepare(
          `SELECT c.id,c.slug,${displayName("c")} AS name,c.parent_id AS parentId,c.is_rankable AS isRankable FROM categories c WHERE c.is_active=1 ORDER BY name LIMIT 2000`,
        )
        .bind(countryId),
      this.db
        .prepare(
          `SELECT pc.category_id AS categoryId,COUNT(DISTINCT p.id) AS productCount,
            COUNT(DISTINCT CASE WHEN s.rating_count>0 AND pc.ranking_eligible=1 AND ${eligible} THEN p.id END) AS rankedCount
          FROM product_categories pc JOIN products p ON p.id=pc.product_id AND p.country_id=? AND ${visible}
          JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
          LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=pc.category_id
          GROUP BY pc.category_id`,
        )
        .bind(countryId),
    ]);
    return {
      categories: categories!.results as unknown as TaxonomyNode[],
      counts: counts!.results as unknown as TaxonomyCounts[],
    };
  }

  async categories(countryId: string, parentId?: string) {
    return (
      await this.db
        .prepare(
          `SELECT ${categoryFields} FROM categories c WHERE c.is_active=1 AND ${parentId ? "c.parent_id=?" : "c.is_rankable=1"} ORDER BY c.name LIMIT 100`,
        )
        .bind(countryId, countryId, ...(parentId ? [parentId] : []))
        .all<CategorySummary>()
    ).results;
  }

  async sitemap() {
    const [categories, products] = await this.db.batch<{
      slug: string;
      updatedAt: number;
      country: string;
    }>([
      this.db.prepare(
        // Foods and aisles have pages; shelves redirect into their aisle.
        `SELECT slug,updated_at AS updatedAt,NULL AS country FROM categories
        WHERE is_active=1 AND (is_rankable=1 OR parent_id IN (SELECT id FROM categories WHERE parent_id IS NULL AND is_active=1))
        ORDER BY slug LIMIT 10000`,
      ),
      // Discontinued products stay indexable with their status; hidden
      // (archived duplicates) and inactive markets are excluded.
      this.db.prepare(
        `SELECT p.slug,p.updated_at AS updatedAt,lower(country.iso2) AS country FROM products p JOIN countries country ON country.id=p.country_id AND country.is_active=1
        WHERE ${visible} ORDER BY country.iso2,p.slug LIMIT 40000`,
      ),
    ]);
    return { categories: categories!.results, products: products!.results };
  }

  async featuredCategories(countryId: string) {
    return (
      await this.db
        .prepare(
          `SELECT ${categoryFields} FROM category_features f
          JOIN categories c ON c.id=f.category_id AND c.is_active=1 WHERE f.country_id=? ORDER BY f.position LIMIT 12`,
        )
        .bind(countryId, countryId, countryId)
        .all<CategorySummary>()
    ).results;
  }

  categoryRedirect(slug: string) {
    return resolveCategoryRedirect(this.db, slug);
  }

  category(countryId: string, slug: string) {
    return this.db
      .prepare(
        `SELECT ${categoryFields} FROM categories c WHERE c.slug=? AND c.is_active=1`,
      )
      .bind(countryId, countryId, slug)
      .first<CategorySummary>();
  }

  // Top order is computed over the whole ranking first, so a filtered row
  // still shows its overall rank and filters never change a score.
  async rankings(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ) {
    const filter = filterSql(filters, "ranked", "ranked_v");
    const stores = matchedStoresSql(filters, "ranked");
    const rows = (
      await this.db
        .prepare(
          `WITH ranked AS (SELECT ${identity},s.bayesian_score AS bayesianScore,s.rating_count AS ratingCount,
            ROW_NUMBER() OVER (ORDER BY ${rankingOrderSql}) AS topRank
          FROM product_category_stats s JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1 ${productJoins}
          ${rankedMembershipSql}
          WHERE s.category_id=? AND ${eligible} AND ${rankedSampleSql})
          SELECT ranked.*${stores.sql} FROM ranked JOIN product_versions ranked_v ON ranked_v.id=ranked.versionId
          WHERE 1=1${filter.sql} ORDER BY ranked.topRank LIMIT ? OFFSET ?`,
        )
        .bind(
          countryId,
          categoryId,
          ...stores.binds,
          ...filter.binds,
          limit,
          offset,
        )
        .all<RankingRow>()
    ).results;
    return parseStores(rows);
  }

  // Trending reads the precomputed trends read model, never raw ratings.
  async trending(
    countryId: string,
    categoryId: string | null,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ) {
    const filter = filterSql(filters);
    const stores = matchedStoresSql(filters);
    const rows = (
      await this.db
        .prepare(
          `SELECT ${identity},${categoryId ? "s.bayesian_score" : "NULL"} AS bayesianScore,${categoryId ? "COALESCE(s.rating_count,0)" : "0"} AS ratingCount,${allergensSql()} AS allergens,
        ${categoryId ? "COALESCE(s.recent_rating_count,0)" : "0"} AS recentRatingCount${stores.sql}
      FROM product_category_trends t JOIN product_versions v ON v.id=t.product_version_id AND v.is_current=1 ${productJoins}
      JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=t.category_id AND pc.ranking_eligible=1
      JOIN categories c ON c.id=t.category_id AND c.is_active=1 AND c.is_rankable=1
      LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=t.category_id
      WHERE ${categoryId ? "t.category_id=? AND" : ""} t.trending_score>0 AND ${eligible}${filter.sql}
      ${categoryId ? "" : "GROUP BY p.id"}
      ORDER BY ${categoryId ? "t.trending_score" : "MAX(t.trending_score)"} DESC,p.id LIMIT ? OFFSET ?`,
        )
        .bind(
          ...stores.binds,
          countryId,
          ...(categoryId ? [categoryId] : []),
          ...filter.binds,
          limit,
          offset,
        )
        .all<DiscoveryRow>()
    ).results;
    return parseStores(rows).map(parseAllergens);
  }

  // New is chronological discovery of recently published, eligible products.
  async newest(
    countryId: string,
    categoryId: string | null,
    since: number,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ) {
    const filter = filterSql(filters);
    const stores = matchedStoresSql(filters);
    const rows = (
      await this.db
        .prepare(
          `SELECT ${identity},${categoryId ? "s.bayesian_score" : "NULL"} AS bayesianScore,${categoryId ? "COALESCE(s.rating_count,0)" : "0"} AS ratingCount,${allergensSql()} AS allergens,0 AS recentRatingCount${stores.sql}
      FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
      JOIN countries country ON country.id=p.country_id AND country.is_active=1 LEFT JOIN brands b ON b.id=p.brand_id
      ${categoryId ? "JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=? AND pc.ranking_eligible=1 LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=pc.category_id" : ""}
      WHERE p.country_id=? AND p.published_at>=? AND ${eligible}${filter.sql}
      ${categoryId ? "" : "AND EXISTS(SELECT 1 FROM product_categories pc JOIN categories c ON c.id=pc.category_id AND c.is_active=1 AND c.is_rankable=1 WHERE pc.product_id=p.id AND pc.ranking_eligible=1)"}
      ORDER BY p.published_at DESC,p.id DESC LIMIT ? OFFSET ?`,
        )
        .bind(
          ...stores.binds,
          ...(categoryId ? [categoryId] : []),
          countryId,
          since,
          ...filter.binds,
          limit,
          offset,
        )
        .all<DiscoveryRow>()
    ).results;
    return parseStores(rows).map(parseAllergens);
  }

  async unranked(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
    offset: number,
    limit: number,
    publishedBefore?: number,
  ) {
    const filter = filterSql(filters);
    const before = publishedBefore === undefined ? [] : [publishedBefore];
    return (
      await this.db
        .prepare(
          `SELECT ${identity},${allergensSql()} AS allergens FROM product_categories pc
      JOIN product_versions v ON v.product_id=pc.product_id AND v.is_current=1 ${productJoins}
      LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=pc.category_id
      WHERE pc.category_id=? AND pc.ranking_eligible=1 AND ${eligible} AND COALESCE(s.rating_count,0)=0${filter.sql}${before.length ? " AND (p.published_at IS NULL OR p.published_at<?)" : ""}
      ORDER BY p.name,p.id LIMIT ? OFFSET ?`,
        )
        .bind(countryId, categoryId, ...filter.binds, ...before, limit, offset)
        .all<ProductSummary & { allergens: unknown }>()
    ).results.map(parseAllergens);
  }

  // The first products of several foods in Top order (aggregates only, never
  // raw ratings), for aisle menus, search previews and the home page.
  async topProducts(countryId: string, categoryIds: string[], perFood: number) {
    if (!categoryIds.length) return [];
    return (
      await this.db
        .prepare(
          `WITH ranked AS (SELECT s.category_id AS categoryId,p.id,p.slug,p.name,b.name AS brand,s.bayesian_score AS bayesianScore,s.rating_count AS ratingCount,
            ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY ${rankingOrderSql}) AS rank
          FROM product_category_stats s JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1 ${productJoins}
          ${rankedMembershipSql}
          WHERE s.category_id IN (SELECT value FROM json_each(?)) AND ${eligible} AND ${rankedSampleSql})
          SELECT * FROM ranked WHERE rank<=? ORDER BY categoryId,rank`,
        )
        .bind(countryId, JSON.stringify(categoryIds), perFood)
        .all<TopProduct>()
    ).results;
  }

  // Every ranked product of a food with its Top rank over the unfiltered set,
  // whether it passes each filter, its allergen declaration and its detail
  // answer counts. Views, filters and badges are applied in the domain.
  async rankedSet(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
  ) {
    const storeFilter = filterSql({ stores: filters.stores, freeFrom: [] });
    const allergenFilter = filterSql({
      stores: [],
      freeFrom: filters.freeFrom,
    });
    const stores = matchedStoresSql(filters);
    const rows = (
      await this.db
        .prepare(
          `SELECT ${identity},s.bayesian_score AS bayesianScore,s.rating_count AS ratingCount,s.recent_rating_count AS recentRatingCount,
            ROW_NUMBER() OVER (ORDER BY ${rankingOrderSql}) AS topRank,
            CASE WHEN 1=1${storeFilter.sql} THEN 1 ELSE 0 END AS storeMatch,
            CASE WHEN 1=1${allergenFilter.sql} THEN 1 ELSE 0 END AS allergenMatch,
            ${allergensSql()} AS allergens,
            (SELECT json_group_object(ds.dimension_id,json_array(ds.answer_count,ds.answer_sum)) FROM product_category_dimension_stats ds
              WHERE ds.product_version_id=v.id AND ds.category_id=s.category_id) AS details${stores.sql}
          FROM product_category_stats s JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1 ${productJoins}
          ${rankedMembershipSql}
          WHERE s.category_id=? AND ${eligible} AND ${rankedSampleSql}
          ORDER BY topRank LIMIT 1000`,
        )
        .bind(
          ...storeFilter.binds,
          ...allergenFilter.binds,
          ...stores.binds,
          countryId,
          categoryId,
        )
        .all<
          Omit<RankedRow, "details" | "allergens" | "matchedStores"> & {
            details: string | null;
            allergens: unknown;
            matchedStores: unknown;
          }
        >()
    ).results;
    return parseStores(rows).map((row) => ({
      ...parseAllergens(row),
      details: (row.details
        ? JSON.parse(row.details)
        : {}) as RankedRow["details"],
    }));
  }

  // A food's active detail questions, in order.
  async questions(categoryId: string) {
    return (
      await this.db
        .prepare(
          "SELECT id,key,label FROM category_rating_dimensions WHERE category_id=? AND is_active=1 ORDER BY sort_order,key",
        )
        .bind(categoryId)
        .all<{ id: string; key: string; label: string }>()
    ).results;
  }

  // The trending products of a country, each in the food it trends most in,
  // with that food's Top score and this week's new ratings.
  async homeTrending(countryId: string, limit: number) {
    return (
      await this.db
        .prepare(
          `WITH best AS (SELECT t.product_version_id AS versionId,t.category_id AS categoryId,t.trending_score AS trendingScore,
            ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY t.trending_score DESC,t.category_id) AS n
            FROM product_category_trends t JOIN product_versions v ON v.id=t.product_version_id AND v.is_current=1 ${productJoins}
            JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=t.category_id AND pc.ranking_eligible=1
            JOIN categories c ON c.id=t.category_id AND c.is_active=1 AND c.is_rankable=1
            WHERE t.trending_score>0 AND ${eligible})
          SELECT ${identity},c.slug AS foodSlug,${displayName("c", "p.country_id")} AS foodName,s.bayesian_score AS bayesianScore,
            COALESCE(s.rating_count,0) AS ratingCount,COALESCE(s.recent_rating_count,0) AS recentRatingCount
          FROM best JOIN product_versions v ON v.id=best.versionId ${productJoins} JOIN categories c ON c.id=best.categoryId
          LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=c.id
          WHERE best.n=1 ORDER BY best.trendingScore DESC,p.id LIMIT ?`,
        )
        .bind(countryId, countryId, limit)
        .all<HomeProduct>()
    ).results;
  }

  // Recently added products with the food most of their ratings are in.
  async homeNewest(countryId: string, since: number, limit: number) {
    const rows = (
      await this.db
        .prepare(
          `SELECT ${identity},
            (SELECT json_object('slug',c.slug,'name',${displayName("c", "p.country_id")},'score',s.bayesian_score,'ratings',COALESCE(s.rating_count,0))
              FROM product_categories pc JOIN categories c ON c.id=pc.category_id AND c.is_active=1 AND c.is_rankable=1
              LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=c.id
              WHERE pc.product_id=p.id AND pc.ranking_eligible=1 ORDER BY COALESCE(s.rating_count,0) DESC,c.name LIMIT 1) AS food
          FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
          JOIN countries country ON country.id=p.country_id AND country.is_active=1 LEFT JOIN brands b ON b.id=p.brand_id
          WHERE p.country_id=? AND p.published_at>=? AND ${eligible}
          ORDER BY p.published_at DESC,p.id DESC LIMIT ?`,
        )
        .bind(countryId, since, limit)
        .all<ProductSummary & { food: string | null }>()
    ).results;
    return rows.flatMap((row) => {
      if (!row.food) return [];
      const food = JSON.parse(row.food) as {
        slug: string;
        name: string;
        score: number | null;
        ratings: number;
      };
      return [
        {
          ...row,
          foodSlug: food.slug,
          foodName: food.name,
          bayesianScore: food.score,
          ratingCount: food.ratings,
          recentRatingCount: 0,
        } satisfies HomeProduct,
      ];
    });
  }

  async productCount(countryId: string) {
    return (
      (await this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1 WHERE p.country_id=? AND ${eligible}`,
        )
        .bind(countryId)
        .first<number>("n")) ?? 0
    );
  }

  // Where each product stands: its best Top rank and that food, or (when it
  // is not ranked yet) the first food it belongs to.
  async productPlacement(countryId: string, productIds: string[]) {
    if (!productIds.length) return [];
    const ids = JSON.stringify(productIds);
    const [ranked, foods] = await this.db.batch<ProductPlacement>([
      this.db
        .prepare(
          `WITH ranked AS (SELECT s.category_id AS categoryId,p.id AS productId,s.bayesian_score AS bayesianScore,s.rating_count AS ratingCount,
            ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY ${rankingOrderSql}) AS rank
            FROM product_category_stats s JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1 ${productJoins}
            ${rankedMembershipSql}
            WHERE s.category_id IN (SELECT x.category_id FROM product_categories x WHERE x.product_id IN (SELECT value FROM json_each(?))) AND ${eligible} AND ${rankedSampleSql})
          SELECT r.productId,r.rank,r.bayesianScore,r.ratingCount,c.slug AS foodSlug,${displayName("c")} AS foodName
          FROM ranked r JOIN categories c ON c.id=r.categoryId WHERE r.productId IN (SELECT value FROM json_each(?)) ORDER BY r.productId,r.rank,c.slug`,
        )
        .bind(countryId, ids, countryId, ids),
      this.db
        .prepare(
          `SELECT pc.product_id AS productId,NULL AS rank,NULL AS bayesianScore,0 AS ratingCount,c.slug AS foodSlug,${displayName("c")} AS foodName
          FROM product_categories pc JOIN categories c ON c.id=pc.category_id AND c.is_active=1 AND c.is_rankable=1
          WHERE pc.product_id IN (SELECT value FROM json_each(?)) AND pc.ranking_eligible=1 ORDER BY pc.product_id,c.name`,
        )
        .bind(countryId, ids),
    ]);
    return productIds.flatMap((id) => {
      const row =
        ranked!.results.find((r) => r.productId === id) ??
        foods!.results.find((r) => r.productId === id);
      return row ? [row] : [];
    });
  }

  // Each store in the country's active markets with its number of ranked
  // swaps in this food under the current Free-from choice (but not the store
  // choice), so a count says what choosing that store adds.
  async storeOptions(
    countryId: string,
    categoryId: string,
    freeFrom: string[],
  ) {
    const filter = filterSql({ stores: [], freeFrom });
    return (
      await this.db
        .prepare(
          `WITH ranked AS (SELECT p.id FROM product_category_stats s JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1 ${productJoins}
            ${rankedMembershipSql}
            WHERE s.category_id=? AND ${eligible} AND ${rankedSampleSql}${filter.sql})
          SELECT r.slug,COALESCE(m.market_name,r.canonical_name) AS name,
            (SELECT COUNT(*) FROM product_retailers pr WHERE pr.retailer_id=r.id AND pr.status='active' AND pr.product_id IN (SELECT id FROM ranked)) AS count
          FROM retailer_markets m JOIN retailers r ON r.id=m.retailer_id
          WHERE m.country_id=? AND m.is_active=1 ORDER BY count DESC,name LIMIT 50`,
        )
        .bind(countryId, categoryId, ...filter.binds, countryId)
        .all<StoreOption>()
    ).results;
  }

  // Values the country offers, used to validate filter parameters.
  async filterOptions(countryId: string) {
    const [stores, allergens] = await this.db.batch<{
      key: string;
      label: string;
    }>([
      this.db
        .prepare(
          "SELECT r.slug AS key,COALESCE(m.market_name,r.canonical_name) AS label FROM retailer_markets m JOIN retailers r ON r.id=m.retailer_id WHERE m.country_id=? AND m.is_active=1 ORDER BY label LIMIT 500",
        )
        .bind(countryId),
      this.db
        .prepare(
          "SELECT ca.allergen_key AS key,COALESCE(ca.label,a.label) AS label FROM country_allergens ca JOIN allergens a ON a.key=ca.allergen_key WHERE ca.country_id=? ORDER BY ca.position",
        )
        .bind(countryId),
    ]);
    return { stores: stores!.results, allergens: allergens!.results };
  }

  async product(
    countryId: string,
    slug: string,
    versionId: string | null,
  ): Promise<ProductDetails | null> {
    const row = await this.db
      .prepare(
        `SELECT ${identity},country.name AS country,p.vegan_status AS veganStatus,p.manufacturer_label AS manufacturerLabel,p.lifecycle_status AS lifecycleStatus,p.data_notes AS dataNotes
      FROM product_versions v ${productJoins} WHERE p.slug=? AND ${visible} AND ${versionId ? "v.id=?" : "v.is_current=1"}`,
      )
      .bind(countryId, slug, ...(versionId ? [versionId] : []))
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
          `SELECT c.id,c.slug,${displayName("c", "p.country_id")} AS name,c.is_active AS isActive,CASE WHEN pc.ranking_eligible=1 AND c.is_active=1 AND c.is_rankable=1 AND ${eligible} AND v.is_current=1 THEN 1 ELSE 0 END AS canRate,s.bayesian_score AS bayesianScore,COALESCE(s.rating_count,0) AS ratingCount,
        (SELECT json_group_array(json_object('key',d.key,'label',d.label)) FROM (SELECT key,label FROM category_rating_dimensions WHERE category_id=c.id AND is_active=1 ORDER BY sort_order,key) d) AS dimensions
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
      categories: (
        categories!.results as unknown as (Omit<
          ProductCategory,
          "dimensions"
        > & { dimensions: string })[]
      ).map((category) => ({
        ...category,
        dimensions: JSON.parse(
          category.dimensions,
        ) as ProductCategory["dimensions"],
      })),
      images: images!.results as unknown as ProductDetails["images"],
    };
  }

  // Per-food context for one formula: Top rank among the food's ranked
  // products, detail answers, familiarity counts and the allergen label.
  async productInsights(
    countryId: string,
    productId: string,
    versionId: string,
  ) {
    const [ranks, details, familiarity, allergens] = await this.db.batch<
      Record<string, unknown>
    >([
      this.db
        .prepare(
          `WITH ranked AS (SELECT s.category_id AS categoryId,s.product_version_id AS versionId,
            ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY ${rankingOrderSql}) AS rank,
            COUNT(*) OVER (PARTITION BY s.category_id) AS rankedCount
            FROM product_category_stats s JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1 ${productJoins}
            ${rankedMembershipSql}
            WHERE s.category_id IN (SELECT category_id FROM product_categories WHERE product_id=?) AND ${eligible} AND ${rankedSampleSql})
          SELECT categoryId,rank,rankedCount FROM ranked WHERE versionId=?`,
        )
        // Top ranks current formulas, so an earlier formula gets no rank.
        .bind(countryId, productId, versionId),
      this.db
        .prepare(
          `SELECT ds.category_id AS categoryId,d.key,ds.answer_count AS count,ds.answer_sum AS sum FROM product_category_dimension_stats ds
          JOIN category_rating_dimensions d ON d.id=ds.dimension_id AND d.is_active=1 WHERE ds.product_version_id=?`,
        )
        .bind(versionId),
      this.db
        .prepare(
          "SELECT category_id AS categoryId,recency,overall_similarity AS score,rating_count AS count FROM product_category_familiarity_stats WHERE product_version_id=?",
        )
        .bind(versionId),
      this.db
        .prepare(
          `SELECT ${allergensSql("v")} AS allergens,
            (SELECT e.confirm_count FROM product_version_allergen_declarations d JOIN edit_proposals e ON e.id=d.source_proposal_id WHERE d.product_version_id=v.id) AS confirmations
          FROM product_versions v WHERE v.id=?`,
        )
        .bind(versionId),
    ]);
    const label = allergens!.results[0];
    return {
      ranks: ranks!.results as {
        categoryId: string;
        rank: number;
        rankedCount: number;
      }[],
      details: details!.results as {
        categoryId: string;
        key: string;
        count: number;
        sum: number;
      }[],
      familiarity: familiarity!.results as {
        categoryId: string;
        recency: string;
        score: number;
        count: number;
      }[],
      allergens: label?.allergens
        ? (JSON.parse(String(label.allergens)) as AllergenDeclaration)
        : null,
      allergenConfirmations:
        typeof label?.confirmations === "number" ? label.confirmations : null,
    };
  }

  async search(countryId: string, iso2: string, expression: string) {
    const [categories, products] = await this.db.batch([
      this.db
        .prepare(
          `SELECT ${categoryFields} FROM search_index JOIN categories c ON c.id=search_index.entity_id AND c.is_active=1 WHERE search_index MATCH ? AND entity_type='category' AND country_code=? ORDER BY rank,c.name LIMIT 12`,
        )
        .bind(countryId, countryId, expression, iso2),
      this.db
        .prepare(
          `SELECT ${identity} FROM search_index JOIN product_versions v ON v.product_id=search_index.entity_id AND v.is_current=1 ${productJoins} WHERE search_index MATCH ? AND entity_type='product' AND country_code=? AND p.lifecycle_status<>'discontinued' AND ${visible} ORDER BY rank,p.name,p.id LIMIT 20`,
        )
        .bind(countryId, expression, iso2),
    ]);
    return {
      categories: categories!.results as unknown as CategorySummary[],
      products: products!.results as unknown as ProductSummary[],
    };
  }

  canonicalRedirect(countryId: string, slug: string) {
    return readCanonicalRedirect(this.db, countryId, slug);
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
