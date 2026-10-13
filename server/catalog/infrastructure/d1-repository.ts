import { resolveCategoryRedirect } from "../../taxonomy/infrastructure/redirects";
import type {
  BrandLineRow,
  BrandRow,
  CatalogRepository,
  FlavorRow,
  LineStanding,
  LineSummary,
  SiblingFlavor,
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
  StoreOption,
  TaxonomyCounts,
  TopProduct,
} from "../domain/contracts";
import type { RankingFilters } from "../domain/filters";
import type { AllergenDeclaration } from "../../community/domain/allergens";
import type { TaxonomyNode } from "../../taxonomy/domain/shape";
import { eligibleProductSql as eligible } from "../../ranking/infrastructure/read-policy";
import {
  communityProductDetails,
  communityProductStatements,
  publicVeganStatusSql,
  readCanonicalRedirect,
} from "../../community/infrastructure/public-read";

// A product's identity, with its name and date expressions.
const identityOf = (
  name: string,
  publishedAt: string,
) => `p.id,p.slug,${name} AS name,b.name AS brand,v.id AS versionId,p.development_only AS developmentOnly,${publishedAt} AS publishedAt,
  (SELECT i.id FROM product_images i WHERE i.product_version_id=v.id AND i.slot='front' AND i.state='accepted' LIMIT 1) AS imageId`;
const identity = identityOf("p.name", "p.published_at");
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
// Aisles are shared; a food is listed in a country only where it
// is switched on (milestone 6). Binds the country ID once.
const onHere = (category: string) =>
  `(${category}.is_rankable=0 OR EXISTS(SELECT 1 FROM category_countries cc WHERE cc.category_id=${category}.id AND cc.country_id=?))`;
// Binds the country ID three times: display name, product count, availability.
const categoryFields = `c.id,c.slug,${displayName("c")} AS name,c.parent_id AS parentId,c.is_rankable AS isRankable,c.season_start AS seasonStart,c.season_end AS seasonEnd,
 (SELECT COUNT(*) FROM product_categories pc JOIN products p ON p.id=pc.product_id WHERE pc.category_id=c.id AND p.country_id=? AND ${visible}) AS productCount,
 ${onHere("c")} AS available`;

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

// A recipe line's eligible flavors in its food (milestone 7), for filters
// that show a line when any flavor matches.
const lineFlavorJoins = (category: string) => `products lf
  JOIN product_versions lfv ON lfv.product_id=lf.id AND lfv.is_current=1
  JOIN product_categories lfc ON lfc.product_id=lf.id AND lfc.category_id=${category} AND lfc.ranking_eligible=1`;
const lineFlavorWhere = (family: string) =>
  `lf.product_family_id=${family} AND lf.lifecycle_status='active' AND lf.vegan_status<>'under_review'`;
// True when some eligible flavor of the line passes the filters.
function lineMatchExpr(
  filters: RankingFilters,
  family = "s.product_family_id",
  category = "s.category_id",
): Fragment {
  const inner = filterSql(filters, "lf", "lfv");
  return inner.sql
    ? {
        sql: `EXISTS(SELECT 1 FROM ${lineFlavorJoins(category)} WHERE ${lineFlavorWhere(family)}${inner.sql})`,
        binds: inner.binds,
      }
    : { sql: "1", binds: [] };
}
function lineFilterSql(
  filters: RankingFilters,
  family = "s.product_family_id",
  category = "s.category_id",
): Fragment {
  const match = lineMatchExpr(filters, family, category);
  return match.sql === "1"
    ? { sql: "", binds: [] }
    : { sql: ` AND ${match.sql}`, binds: match.binds };
}
// The chosen stores where any of the line's eligible flavors is found.
function lineMatchedStoresSql(
  filters: RankingFilters,
  family = "s.product_family_id",
  category = "s.category_id",
): Fragment {
  if (!filters.stores.length)
    return { sql: ",NULL AS matchedStores", binds: [] };
  return {
    sql: `,(SELECT json_group_array(DISTINCT r.slug) FROM ${lineFlavorJoins(category)}
      JOIN product_retailers pr ON pr.product_id=lf.id AND pr.status='active'
      JOIN retailers r ON r.id=pr.retailer_id
      JOIN retailer_markets m ON m.retailer_id=pr.retailer_id AND m.country_id=lf.country_id AND m.is_active=1
      WHERE ${lineFlavorWhere(family)} AND r.slug IN (SELECT value FROM json_each(?))) AS matchedStores`,
    binds: [JSON.stringify(filters.stores)],
  };
}

// A recipe line in a food (alias s, family_category_stats), shown by its
// lead flavor (p, v). The line's name is the flavor's own name when it has
// one flavor in the food. Binds the country ID once.
const lineJoins = `JOIN product_families fam ON fam.id=s.product_family_id
  JOIN product_versions v ON v.product_id=s.lead_product_id AND v.is_current=1 ${productJoins}
  JOIN categories c ON c.id=s.category_id AND c.is_active=1 AND c.is_rankable=1`;
const flavorCountSql = `(SELECT COUNT(*) FROM ${lineFlavorJoins("s.category_id")} WHERE ${lineFlavorWhere("s.product_family_id")})`;
const lineNameSql = `CASE WHEN ${flavorCountSql}>1 THEN fam.canonical_name ELSE p.name END`;
const lineIdentity = (publishedAt = "p.published_at") =>
  `${identityOf(lineNameSql, publishedAt)},s.product_family_id AS lineId,${flavorCountSql} AS flavorCount`;
// Closest order (RANKING milestone 7): score, people, then the lead flavor.
const lineOrderSql =
  "s.bayesian_score DESC,s.people_count DESC,s.lead_product_id ASC";
const tastiestOrderSql =
  "s.enjoyment_score DESC,s.enjoyment_people DESC,s.lead_product_id ASC";
const lineSampleSql = "s.people_count>0 AND s.bayesian_score IS NOT NULL";

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
          `SELECT co.id,co.iso2,co.name,EXISTS(SELECT 1 FROM family_category_stats s
            JOIN product_families fam ON fam.id=s.product_family_id AND fam.country_id=co.id
            JOIN categories c ON c.id=s.category_id AND c.is_active=1 AND c.is_rankable=1
            WHERE ${lineSampleSql}) AS hasRankings
          FROM countries co WHERE co.is_active=1 ORDER BY CASE WHEN co.iso2='US' THEN 0 ELSE 1 END,co.name LIMIT 300`,
        )
        .all<MarketRow>()
    ).results;
  }

  // Every active category, whether each is on in this country, and per-food
  // counts: the aisle tree is shaped from these in the domain.
  async taxonomy(countryId: string) {
    const [categories, counts] = await this.db.batch([
      this.db
        .prepare(
          `SELECT c.id,c.slug,${displayName("c")} AS name,c.parent_id AS parentId,c.is_rankable AS isRankable,${onHere("c")} AS available,
          c.position,c.season_start AS seasonStart,c.season_end AS seasonEnd FROM categories c WHERE c.is_active=1 ORDER BY name LIMIT 2000`,
        )
        .bind(countryId, countryId),
      this.db
        .prepare(
          // Products are counted as listed; ranked swaps are lines, and
          // popularity (milestone 7) is the people who rated them.
          `WITH lines AS (SELECT s.category_id AS categoryId,COUNT(*) AS ranked,SUM(s.people_count) AS people
            FROM family_category_stats s JOIN product_families fam ON fam.id=s.product_family_id AND fam.country_id=?
            WHERE ${lineSampleSql} GROUP BY s.category_id)
          SELECT pc.category_id AS categoryId,COUNT(DISTINCT p.id) AS productCount,
            COALESCE(MAX(l.ranked),0) AS rankedCount,COALESCE(MAX(l.people),0) AS ratingCount
          FROM product_categories pc JOIN products p ON p.id=pc.product_id AND p.country_id=? AND ${visible}
          JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
          LEFT JOIN lines l ON l.categoryId=pc.category_id
          GROUP BY pc.category_id`,
        )
        .bind(countryId, countryId),
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
          `SELECT ${categoryFields} FROM categories c WHERE c.is_active=1 AND ${onHere("c")} AND ${parentId ? "c.parent_id=?" : "c.is_rankable=1"} ORDER BY c.name LIMIT 100`,
        )
        .bind(
          countryId,
          countryId,
          countryId,
          countryId,
          ...(parentId ? [parentId] : []),
        )
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
        // Foods have pages where they are on; an aisle has a page in a
        // country holding one of its foods.
        `SELECT c.slug,c.updated_at AS updatedAt,lower(co.iso2) AS country FROM categories c
        JOIN category_countries cc ON cc.category_id=c.id JOIN countries co ON co.id=cc.country_id AND co.is_active=1
        WHERE c.is_active=1 AND c.is_rankable=1
        UNION
        SELECT a.slug,a.updated_at,lower(co.iso2) FROM categories a
        JOIN categories food ON food.parent_id=a.id AND food.is_active=1 AND food.is_rankable=1
        JOIN category_countries cc ON cc.category_id=food.id JOIN countries co ON co.id=cc.country_id AND co.is_active=1
        WHERE a.is_active=1 AND a.is_rankable=0 AND a.parent_id IN (SELECT id FROM categories WHERE parent_id IS NULL AND is_active=1)
        ORDER BY 3,1 LIMIT 20000`,
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
          JOIN categories c ON c.id=f.category_id AND c.is_active=1 WHERE f.country_id=? AND ${onHere("c")} ORDER BY f.position LIMIT 12`,
        )
        .bind(countryId, countryId, countryId, countryId, countryId)
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
      .bind(countryId, countryId, countryId, slug)
      .first<CategorySummary>();
  }

  // Every food's other names in a country (not its display name there), for
  // the contribution food picker.
  async foodAliases(countryId: string) {
    return (
      await this.db
        .prepare(
          // A food renamed for this country keeps its base name searchable.
          `SELECT a.category_id AS categoryId,a.alias FROM category_aliases a JOIN categories c ON c.id=a.category_id AND c.is_active=1 AND c.is_rankable=1
          WHERE (a.country_id IS NULL OR a.country_id=?) AND a.is_display_name=0
          UNION SELECT c.id,c.name FROM categories c JOIN category_aliases d ON d.category_id=c.id AND d.country_id=? AND d.is_display_name=1
          WHERE c.is_active=1 AND c.is_rankable=1
          ORDER BY 2 LIMIT 10000`,
        )
        .bind(countryId, countryId)
        .all<{ categoryId: string; alias: string }>()
    ).results;
  }

  // Lowercase codes of the active countries where a food is on.
  async foodCountries(categoryId: string) {
    return (
      await this.db
        .prepare(
          `SELECT lower(co.iso2) AS code FROM category_countries cc JOIN countries co ON co.id=cc.country_id AND co.is_active=1
          WHERE cc.category_id=? ORDER BY CASE WHEN co.iso2='US' THEN 0 ELSE 1 END,co.name`,
        )
        .bind(categoryId)
        .all<{ code: string }>()
    ).results.map((row) => row.code);
  }

  // Trending reads the precomputed trends of recipe lines, never raw ratings.
  // Each line is shown by its lead flavor with the line's figures.
  async trending(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ) {
    const filter = lineFilterSql(filters);
    const stores = lineMatchedStoresSql(filters);
    const rows = (
      await this.db
        .prepare(
          `SELECT ${lineIdentity()},s.bayesian_score AS bayesianScore,s.people_count AS ratingCount,${allergensSql()} AS allergens,
            s.recent_count AS recentRatingCount${stores.sql}
          FROM family_category_trends t
          JOIN family_category_stats s ON s.product_family_id=t.product_family_id AND s.category_id=t.category_id
          ${lineJoins}
          WHERE t.category_id=?${filter.sql}
          ORDER BY t.rank LIMIT ? OFFSET ?`,
        )
        .bind(
          ...stores.binds,
          countryId,
          categoryId,
          ...filter.binds,
          limit,
          offset,
        )
        .all<DiscoveryRow>()
    ).results;
    return parseStores(rows).map(parseAllergens);
  }

  // New lists recipe lines that first appeared in the food within the
  // window, newest first, shown by their lead flavor.
  async newest(
    countryId: string,
    categoryId: string,
    since: number,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ) {
    const filter = lineFilterSql(filters);
    const stores = lineMatchedStoresSql(filters);
    const rows = (
      await this.db
        .prepare(
          `SELECT ${lineIdentity("f.first_published_at")},s.bayesian_score AS bayesianScore,s.people_count AS ratingCount,${allergensSql()} AS allergens,
            0 AS recentRatingCount${stores.sql}
          FROM family_category_first_published f
          JOIN family_category_stats s ON s.product_family_id=f.product_family_id AND s.category_id=f.category_id
          ${lineJoins}
          WHERE f.category_id=? AND f.first_published_at>=?${filter.sql}
          ORDER BY f.first_published_at DESC,f.product_family_id DESC LIMIT ? OFFSET ?`,
        )
        .bind(
          ...stores.binds,
          countryId,
          categoryId,
          since,
          ...filter.binds,
          limit,
          offset,
        )
        .all<DiscoveryRow>()
    ).results;
    return parseStores(rows).map(parseAllergens);
  }

  // Lines without counted ratings yet, by name.
  async unranked(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
    offset: number,
    limit: number,
    publishedBefore?: number,
  ) {
    const filter = lineFilterSql(filters);
    const before = publishedBefore === undefined ? [] : [publishedBefore];
    return (
      await this.db
        .prepare(
          `SELECT ${lineIdentity()},${allergensSql()} AS allergens
          FROM family_category_stats s ${lineJoins}
          LEFT JOIN family_category_first_published f ON f.product_family_id=s.product_family_id AND f.category_id=s.category_id
          WHERE s.category_id=? AND s.people_count=0${filter.sql}${before.length ? " AND (f.first_published_at IS NULL OR f.first_published_at<?)" : ""}
          ORDER BY name,s.product_family_id LIMIT ? OFFSET ?`,
        )
        .bind(countryId, categoryId, ...filter.binds, ...before, limit, offset)
        .all<LineSummary & { allergens: unknown }>()
    ).results.map(parseAllergens);
  }

  // Each listed line's eligible flavors in the food, with their own scores
  // and whether they pass the filters, in one query.
  async flavors(
    countryId: string,
    categoryId: string,
    lineIds: string[],
    filters: RankingFilters,
  ) {
    if (!lineIds.length) return [];
    const match = filterSql(filters, "lf", "lfv");
    return (
      await this.db
        .prepare(
          `SELECT lf.product_family_id AS lineId,lf.id,lf.slug,lf.name,lf.flavor,lfv.id AS versionId,lf.published_at AS publishedAt,
            ps.bayesian_score AS closestScore,COALESCE(ps.rating_count,0) AS closestCount,
            ps.enjoyment_score AS tastiestScore,COALESCE(ps.enjoyment_count,0) AS tastiestCount,
            ${allergensSql("lfv")} AS allergens,
            CASE WHEN 1=1${match.sql} THEN 1 ELSE 0 END AS matches
          FROM ${lineFlavorJoins("?")}
          LEFT JOIN product_category_stats ps ON ps.product_version_id=lfv.id AND ps.category_id=lfc.category_id
          WHERE lf.product_family_id IN (SELECT value FROM json_each(?)) AND lf.lifecycle_status='active' AND lf.vegan_status<>'under_review' AND lf.country_id=?
          ORDER BY lf.product_family_id,lf.id`,
        )
        .bind(...match.binds, categoryId, JSON.stringify(lineIds), countryId)
        .all<FlavorRow & { allergens: unknown }>()
    ).results.map(parseAllergens);
  }

  // The first lines of several foods in Closest order (aggregates only,
  // never raw ratings), for aisle menus, search previews and the home page.
  async topProducts(countryId: string, categoryIds: string[], perFood: number) {
    if (!categoryIds.length) return [];
    return (
      await this.db
        .prepare(
          `WITH ranked AS (SELECT s.category_id AS categoryId,s.product_family_id AS lineId,p.id,p.slug,${lineNameSql} AS name,b.name AS brand,
            s.bayesian_score AS bayesianScore,s.people_count AS ratingCount,
            ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY ${lineOrderSql}) AS rank
          FROM family_category_stats s ${lineJoins}
          WHERE s.category_id IN (SELECT value FROM json_each(?)) AND ${lineSampleSql})
          SELECT * FROM ranked WHERE rank<=? ORDER BY categoryId,rank`,
        )
        .bind(countryId, JSON.stringify(categoryIds), perFood)
        .all<TopProduct>()
    ).results;
  }

  // Every ranked line of a food with its Closest rank over the unfiltered
  // set, whether a flavor passes each filter, and its detail answers. Views,
  // filters and badges are applied in the domain, so the set is never
  // truncated: counts, badges and later pages need all of it.
  async rankedSet(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
  ) {
    const storeMatch = lineMatchExpr({ stores: filters.stores, freeFrom: [] });
    const allMatch = lineMatchExpr(filters);
    const stores = lineMatchedStoresSql(filters);
    const rows = (
      await this.db
        .prepare(
          `SELECT ${lineIdentity()},s.bayesian_score AS bayesianScore,s.people_count AS ratingCount,s.recent_count AS recentRatingCount,
            s.enjoyment_score AS tastiestScore,s.enjoyment_people AS tastiestCount,
            ROW_NUMBER() OVER (ORDER BY ${lineOrderSql}) AS topRank,
            CASE WHEN ${storeMatch.sql} THEN 1 ELSE 0 END AS storeMatch,
            CASE WHEN ${allMatch.sql} THEN 1 ELSE 0 END AS allergenMatch,
            EXISTS(SELECT 1 FROM ${lineFlavorJoins("s.category_id")} JOIN product_version_allergen_declarations d ON d.product_version_id=lfv.id
              WHERE ${lineFlavorWhere("s.product_family_id")}) AS confirmed,
            ${allergensSql()} AS allergens,
            (SELECT json_group_object(ds.dimension_id,json_array(ds.people_count,ds.mean_sum)) FROM family_category_dimension_stats ds
              WHERE ds.product_family_id=s.product_family_id AND ds.category_id=s.category_id) AS details${stores.sql}
          FROM family_category_stats s ${lineJoins}
          WHERE s.category_id=? AND ${lineSampleSql}
          ORDER BY topRank`,
        )
        .bind(
          ...storeMatch.binds,
          ...allMatch.binds,
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

  // The trending recipe lines of a country, each in the food it trends most
  // in, shown by its lead flavor with the line's figures there.
  async homeTrending(countryId: string, limit: number) {
    return (
      await this.db
        .prepare(
          `WITH best AS (SELECT t.product_family_id AS familyId,t.category_id AS categoryId,t.trending_score AS trendingScore,
            ROW_NUMBER() OVER (PARTITION BY t.product_family_id ORDER BY t.trending_score DESC,t.category_id) AS n
            FROM family_category_trends t
            JOIN product_families fam ON fam.id=t.product_family_id AND fam.country_id=?
            JOIN categories c ON c.id=t.category_id AND c.is_active=1 AND c.is_rankable=1)
          SELECT ${lineIdentity()},c.slug AS foodSlug,${displayName("c", "p.country_id")} AS foodName,s.bayesian_score AS bayesianScore,
            s.people_count AS ratingCount,s.recent_count AS recentRatingCount
          FROM best JOIN family_category_stats s ON s.product_family_id=best.familyId AND s.category_id=best.categoryId
          ${lineJoins}
          WHERE best.n=1 ORDER BY best.trendingScore DESC,best.familyId LIMIT ?`,
        )
        .bind(countryId, countryId, limit)
        .all<HomeProduct>()
    ).results;
  }

  // Recipe lines that first appeared within the window, each in the food
  // where most people rated it, shown by its lead flavor.
  async homeNewest(countryId: string, since: number, limit: number) {
    return (
      await this.db
        .prepare(
          `WITH fresh AS (SELECT f.product_family_id AS familyId,MIN(f.first_published_at) AS firstPublished
            FROM family_category_first_published f
            JOIN product_families fam ON fam.id=f.product_family_id AND fam.country_id=?
            GROUP BY f.product_family_id HAVING MIN(f.first_published_at)>=?),
          placed AS (SELECT fresh.familyId,fresh.firstPublished,s.category_id AS categoryId,
            ROW_NUMBER() OVER (PARTITION BY fresh.familyId ORDER BY s.people_count DESC,c.name,c.id) AS n
            FROM fresh JOIN family_category_stats s ON s.product_family_id=fresh.familyId
            JOIN categories c ON c.id=s.category_id AND c.is_active=1 AND c.is_rankable=1)
          SELECT ${lineIdentity("placed.firstPublished")},c.slug AS foodSlug,${displayName("c", "p.country_id")} AS foodName,
            s.bayesian_score AS bayesianScore,s.people_count AS ratingCount,0 AS recentRatingCount
          FROM placed JOIN family_category_stats s ON s.product_family_id=placed.familyId AND s.category_id=placed.categoryId
          ${lineJoins}
          WHERE placed.n=1 ORDER BY placed.firstPublished DESC,placed.familyId DESC LIMIT ?`,
        )
        .bind(countryId, since, countryId, limit)
        .all<HomeProduct>()
    ).results;
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

  // Where each product stands: its line's best Closest rank and that food,
  // else its first food with no rank yet.
  async productPlacement(countryId: string, productIds: string[]) {
    if (!productIds.length) return [];
    const ids = JSON.stringify(productIds);
    const [ranked, foods] = await this.db.batch<ProductPlacement>([
      this.db
        .prepare(
          `WITH ranked AS (SELECT s.category_id AS categoryId,s.product_family_id AS lineId,s.bayesian_score AS bayesianScore,s.people_count AS ratingCount,
            ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY ${lineOrderSql}) AS rank
            FROM family_category_stats s ${lineJoins}
            WHERE s.category_id IN (SELECT x.category_id FROM product_categories x WHERE x.product_id IN (SELECT value FROM json_each(?))) AND ${lineSampleSql})
          SELECT x.id AS productId,r.rank,r.bayesianScore,r.ratingCount,c.slug AS foodSlug,${displayName("c")} AS foodName
          FROM products x JOIN ranked r ON r.lineId=x.product_family_id
          JOIN product_categories xpc ON xpc.product_id=x.id AND xpc.category_id=r.categoryId AND xpc.ranking_eligible=1
          JOIN categories c ON c.id=r.categoryId
          WHERE x.id IN (SELECT value FROM json_each(?)) ORDER BY x.id,r.rank,c.slug`,
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
  // lines in this food that have a flavor there passing the current
  // Free-from choice (but not the store choice), so a count says what
  // choosing that store adds.
  async storeOptions(
    countryId: string,
    categoryId: string,
    freeFrom: string[],
  ) {
    const filter = filterSql({ stores: [], freeFrom }, "lf", "lfv");
    return (
      await this.db
        .prepare(
          `WITH ranked AS (SELECT s.product_family_id AS lineId,s.category_id AS categoryId FROM family_category_stats s ${lineJoins}
            WHERE s.category_id=? AND ${lineSampleSql})
          SELECT r.slug,COALESCE(m.market_name,r.canonical_name) AS name,
            (SELECT COUNT(*) FROM ranked WHERE EXISTS(SELECT 1 FROM ${lineFlavorJoins("ranked.categoryId")}
              JOIN product_retailers pr ON pr.product_id=lf.id AND pr.status='active' AND pr.retailer_id=r.id
              WHERE ${lineFlavorWhere("ranked.lineId")}${filter.sql})) AS count
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
        `SELECT ${identity},p.product_family_id AS lineId,p.flavor,country.name AS country,${publicVeganStatusSql()} AS veganStatus,p.manufacturer_label AS manufacturerLabel,p.lifecycle_status AS lifecycleStatus,p.data_notes AS dataNotes
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
          s.enjoyment_score AS tastiestScore,COALESCE(s.enjoyment_count,0) AS tastiestCount,
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
          `WITH ranked AS (SELECT s.category_id AS categoryId,s.product_family_id AS lineId,s.lead_product_id AS leadId,
            s.bayesian_score AS score,s.people_count AS people,s.enjoyment_score AS tastiestScore,s.enjoyment_people AS tastiestPeople,
            ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY ${lineOrderSql}) AS rank,
            COUNT(*) OVER (PARTITION BY s.category_id) AS rankedCount,
            fam.canonical_name AS lineName,${flavorCountSql} AS flavorCount
            FROM family_category_stats s ${lineJoins}
            WHERE s.category_id IN (SELECT category_id FROM product_categories WHERE product_id=?) AND ${lineSampleSql}),
          tasty AS (SELECT s.categoryId,s.lineId,
            ROW_NUMBER() OVER (PARTITION BY s.categoryId ORDER BY s.tastiestScore DESC,s.tastiestPeople DESC,s.leadId) AS tastiestRank,
            COUNT(*) OVER (PARTITION BY s.categoryId) AS tastiestCount
            FROM ranked s WHERE s.tastiestPeople>0)
          SELECT r.categoryId,r.rank,r.rankedCount,r.score,r.people,t.tastiestRank,COALESCE(t.tastiestCount,0) AS tastiestCount,
            r.tastiestScore,r.tastiestPeople,r.lineName,r.flavorCount
          FROM ranked r LEFT JOIN tasty t ON t.categoryId=r.categoryId AND t.lineId=r.lineId
          JOIN products x ON x.id=? AND x.product_family_id=r.lineId AND x.lifecycle_status='active' AND x.vegan_status<>'under_review'
          JOIN product_categories xpc ON xpc.product_id=x.id AND xpc.category_id=r.categoryId AND xpc.ranking_eligible=1
          WHERE EXISTS(SELECT 1 FROM product_versions xv WHERE xv.id=? AND xv.product_id=x.id AND xv.is_current=1)`,
        )
        // Lines rank current formulas, so an earlier formula gets no rank.
        .bind(countryId, productId, productId, versionId),
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
      ranks: ranks!.results as unknown as LineStanding[],
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

  // The line's other products that aren't archived or discontinued.
  async siblings(countryId: string, lineId: string, productId: string) {
    return (
      await this.db
        .prepare(
          `SELECT id,slug,name,flavor FROM products WHERE product_family_id=? AND country_id=? AND id<>? AND lifecycle_status='active'
          ORDER BY flavor IS NOT NULL,flavor,name,id LIMIT 50`,
        )
        .bind(lineId, countryId, productId)
        .all<SiblingFlavor>()
    ).results;
  }

  // Brands with products in the country and their other names; the shared
  // matcher (catalog/domain/brand-match.ts) picks the matches.
  async brands(countryId: string) {
    return (
      await this.db
        .prepare(
          `SELECT b.id,b.slug,b.name,
            (SELECT json_group_array(a.alias) FROM brand_aliases a WHERE a.brand_id=b.id) AS aliases,
            COUNT(p.id) AS productCount
          FROM brands b JOIN products p ON p.brand_id=b.id AND p.country_id=? AND p.lifecycle_status IN ('active','under_review')
          GROUP BY b.id ORDER BY b.name LIMIT 5000`,
        )
        .bind(countryId)
        .all<Omit<BrandRow, "aliases"> & { aliases: string }>()
    ).results.map((row) => ({
      ...row,
      aliases: (JSON.parse(row.aliases) as (string | null)[]).filter(
        (alias): alias is string => !!alias,
      ),
    }));
  }

  brand(countryId: string, slug: string) {
    return this.db
      .prepare(
        `SELECT b.id,b.slug,b.name,(SELECT COUNT(*) FROM products p WHERE p.brand_id=b.id AND p.country_id=? AND p.lifecycle_status IN ('active','under_review')) AS productCount
        FROM brands b WHERE b.slug=?`,
      )
      .bind(countryId, slug)
      .first<Omit<BrandRow, "aliases">>();
  }

  // A brand's lines in the country, by food, with each line's Closest and
  // Tastiest ranks there and its eligible flavors. Lines without counted
  // ratings are listed without ranks.
  async brandLines(countryId: string, brandId: string) {
    const rows = (
      await this.db
        .prepare(
          `WITH foods AS (SELECT DISTINCT s.category_id FROM family_category_stats s
              JOIN product_families fam ON fam.id=s.product_family_id AND fam.brand_id=? AND fam.country_id=?),
            ranked AS (SELECT s.category_id AS categoryId,s.product_family_id AS lineId,
              ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY ${lineOrderSql}) AS closestRank
              FROM family_category_stats s JOIN product_families fam ON fam.id=s.product_family_id AND fam.country_id=?
              WHERE s.category_id IN (SELECT category_id FROM foods) AND ${lineSampleSql}),
            tasty AS (SELECT s.category_id AS categoryId,s.product_family_id AS lineId,
              ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY ${tastiestOrderSql}) AS tastiestRank
              FROM family_category_stats s JOIN product_families fam ON fam.id=s.product_family_id AND fam.country_id=?
              WHERE s.category_id IN (SELECT category_id FROM foods) AND ${lineSampleSql} AND s.enjoyment_people>0)
          SELECT s.category_id AS categoryId,s.product_family_id AS lineId,${lineNameSql} AS name,
            r.closestRank,CASE WHEN ${lineSampleSql} THEN s.bayesian_score END AS closestScore,s.people_count AS people,
            t.tastiestRank,s.enjoyment_score AS tastiestScore,
            (SELECT json_group_array(json_object('id',lf.id,'slug',lf.slug,'name',lf.name,'flavor',lf.flavor))
              FROM (SELECT lf.id,lf.slug,lf.name,lf.flavor FROM ${lineFlavorJoins("s.category_id")}
                WHERE ${lineFlavorWhere("s.product_family_id")} ORDER BY lf.flavor IS NOT NULL,lf.flavor,lf.name) lf) AS flavors
          FROM family_category_stats s ${lineJoins}
          LEFT JOIN ranked r ON r.categoryId=s.category_id AND r.lineId=s.product_family_id
          LEFT JOIN tasty t ON t.categoryId=s.category_id AND t.lineId=s.product_family_id
          WHERE fam.brand_id=?
          ORDER BY s.category_id,r.closestRank IS NULL,r.closestRank,name`,
        )
        .bind(brandId, countryId, countryId, countryId, countryId, brandId)
        .all<Omit<BrandLineRow, "flavors"> & { flavors: string }>()
    ).results;
    return rows.map((row) => ({
      ...row,
      flavors: JSON.parse(row.flavors) as BrandLineRow["flavors"],
    }));
  }

  async search(countryId: string, iso2: string, expression: string) {
    const [categories, products] = await this.db.batch([
      this.db
        .prepare(
          `SELECT ${categoryFields} FROM search_index JOIN categories c ON c.id=search_index.entity_id AND c.is_active=1 WHERE search_index MATCH ? AND entity_type='category' AND country_code=? ORDER BY rank,c.name LIMIT 12`,
        )
        .bind(countryId, countryId, countryId, expression, iso2),
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
