import { ApplicationError } from "../../shared/domain/errors";
import type {
  BrandLine,
  BrandSuggestion,
  Candidate,
  SubmissionIdentity,
} from "../domain/contracts";
import { identityKey, normalizeName, productName } from "../domain/policy";
import { matchingBrands } from "../../catalog/infrastructure/brand-rows";

export interface SubmissionContext {
  countryId: string;
  brandId: string | null;
  brandName: string;
  identity: string;
}

export class CommunityLookupRepository {
  constructor(private readonly db: D1Database) {}
  async contributableProduct(id: string) {
    const product = await this.db
      .prepare(
        "SELECT p.id FROM products p JOIN countries c ON c.id=p.country_id WHERE p.id=? AND p.lifecycle_status<>'hidden' AND c.is_active=1",
      )
      .bind(id)
      .first();
    if (!product)
      throw new ApplicationError(
        "NOT_FOUND",
        "This product is not available for contributions.",
        404,
      );
  }
  // Choices for contribution forms. Retailers are the ones with an active
  // market in the product's country; related products may be in any country.
  async options(query = "", country = "US") {
    const term = `%${query
      .trim()
      .slice(0, 80)
      .replace(/[\\%_]/g, "\\$&")}%`;
    const normalized = `%${normalizeName(query.slice(0, 80)).replace(/[\\%_]/g, "\\$&")}%`;
    const [brands, categories, families, products, retailers] =
      await this.db.batch([
        this.db
          .prepare(
            "SELECT id,name FROM brands WHERE name LIKE ? ESCAPE '\\' OR normalized_name LIKE ? ESCAPE '\\' OR id IN (SELECT brand_id FROM brand_aliases WHERE normalized_name LIKE ? ESCAPE '\\') ORDER BY name LIMIT 50",
          )
          .bind(term, normalized, normalized),
        this.db.prepare(
          "SELECT id,name,slug FROM categories WHERE is_active=1 AND is_rankable=1 ORDER BY name LIMIT 100",
        ),
        this.db
          .prepare(
            "SELECT id,canonical_name AS name,brand_id AS brandId FROM product_families WHERE canonical_name LIKE ? ESCAPE '\\' ORDER BY canonical_name LIMIT 50",
          )
          .bind(term),
        this.db
          .prepare(
            "SELECT p.id,p.name,p.slug,p.country_id AS countryId,c.iso2 AS country FROM products p JOIN countries c ON c.id=p.country_id WHERE p.lifecycle_status<>'hidden' AND c.is_active=1 AND p.name LIKE ? ESCAPE '\\' ORDER BY p.name LIMIT 50",
          )
          .bind(term),
        this.db
          .prepare(
            "SELECT r.id,r.canonical_name AS name,r.website_url AS websiteUrl FROM retailers r JOIN retailer_markets m ON m.retailer_id=r.id JOIN countries c ON c.id=m.country_id WHERE c.iso2=? AND m.is_active=1 AND (r.canonical_name LIKE ? ESCAPE '\\' OR r.normalized_name LIKE ? ESCAPE '\\' OR r.id IN (SELECT retailer_id FROM retailer_aliases WHERE normalized_name LIKE ? ESCAPE '\\')) ORDER BY r.canonical_name LIMIT 50",
          )
          .bind(country.toUpperCase(), term, normalized, normalized),
      ]);
    return {
      brands: brands!.results,
      categories: categories!.results,
      families: families!.results,
      products: products!.results,
      retailers: retailers!.results,
    };
  }
  async categoryNames(ids: string[]) {
    const rows = await this.db
      .prepare(
        "SELECT c.id,c.name FROM categories c JOIN json_each(?) j ON j.value=c.id",
      )
      .bind(JSON.stringify(ids))
      .all<{ id: string; name: string }>();
    return ids.map((id) => rows.results.find((r) => r.id === id)?.name ?? id);
  }
  async context(input: SubmissionIdentity): Promise<SubmissionContext> {
    if (
      !/[\p{L}\p{N}]/u.test(normalizeName(input.brand)) ||
      !/[\p{L}]/u.test(productName(input.name))
    )
      throw new ApplicationError(
        "INVALID_IDENTITY",
        "Use a recognizable brand and product name, with more than a package size.",
      );
    const country = await this.db
      .prepare("SELECT id FROM countries WHERE iso2=? AND is_active=1")
      .bind(input.country)
      .first<{ id: string }>();
    if (!country)
      throw new ApplicationError(
        "INVALID_COUNTRY",
        "This country is not available for contributions.",
      );
    // A suggested food may be the only one, so the list can be empty.
    const categories = input.categoryIds.length
      ? await this.db
          .prepare(
            "SELECT id FROM categories WHERE id IN (SELECT value FROM json_each(?)) AND is_active=1 AND is_rankable=1",
          )
          .bind(JSON.stringify(input.categoryIds))
          .all()
      : { results: [] };
    if (categories.results.length !== input.categoryIds.length)
      throw new ApplicationError(
        "INVALID_CATEGORY",
        "Choose foods that are still listed.",
      );
    // Stores must be ones members report in this country.
    if (input.retailerIds?.length) {
      const stores = await this.db
        .prepare(
          "SELECT COUNT(*) AS n FROM retailer_markets WHERE country_id=? AND is_active=1 AND retailer_id IN (SELECT value FROM json_each(?))",
        )
        .bind(country.id, JSON.stringify(input.retailerIds))
        .first<number>("n");
      if (stores !== input.retailerIds.length)
        throw new ApplicationError(
          "INVALID_RETAILER",
          "Choose stores from this country's list.",
        );
    }
    const brand = await this.db
      .prepare(
        "SELECT id,name FROM brands WHERE normalized_name=? OR id IN (SELECT brand_id FROM brand_aliases WHERE normalized_name=?) LIMIT 1",
      )
      .bind(normalizeName(input.brand), normalizeName(input.brand))
      .first<{ id: string; name: string }>();
    // A product joins a line of its own brand and country.
    if (input.lineId) {
      const line = brand
        ? await this.db
            .prepare(
              "SELECT 1 FROM product_families WHERE id=? AND country_id=? AND brand_id=?",
            )
            .bind(input.lineId, country.id, brand.id)
            .first()
        : null;
      if (!line)
        throw new ApplicationError(
          "INVALID_LINE",
          "Choose a line of this brand in this country.",
        );
    }
    return {
      countryId: country.id,
      brandId: brand?.id ?? null,
      brandName: brand?.name ?? input.brand,
      identity: identityKey(country.id, brand?.name ?? input.brand, input.name),
    };
  }
  /**
   * Brands for Add a product's brand choice (milestone 7): every brand,
   * including ones with nothing here yet, through the shared matcher, each
   * with its visible products in the country.
   */
  async brandSuggestions(
    country: string,
    query: string,
    limit = 8,
  ): Promise<BrandSuggestion[]> {
    if (query.trim().length < 2) return [];
    const countryId = await this.db
      .prepare("SELECT id FROM countries WHERE iso2=? AND is_active=1")
      .bind(country)
      .first<string>("id");
    return (
      await matchingBrands(this.db, countryId ?? "", query, limit, {
        everyBrand: true,
      })
    ).map(({ id, slug, name, aliases, productCount }) => ({
      id,
      slug,
      name,
      aliases,
      productCount,
    }));
  }
  /**
   * What an Add a product link starts with (milestone 7): a product's line
   * ("Add another flavor") and its brand, or a brand page's brand. A line in
   * another country, or one that no longer exists, starts nothing.
   */
  async start(
    country: string,
    { line, brand }: { line: string | null; brand: string | null },
  ): Promise<{
    brand: { id: string; name: string } | null;
    line: { lineId: string; lineName: string } | null;
  }> {
    if (line) {
      const row = await this.db
        .prepare(
          `SELECT f.id AS lineId,f.canonical_name AS lineName,b.id AS brandId,b.name AS brandName FROM product_families f
          JOIN brands b ON b.id=f.brand_id JOIN countries c ON c.id=f.country_id AND c.iso2=? WHERE f.id=?`,
        )
        .bind(country, line)
        .first<{
          lineId: string;
          lineName: string;
          brandId: string;
          brandName: string;
        }>();
      if (row)
        return {
          brand: { id: row.brandId, name: row.brandName },
          line: { lineId: row.lineId, lineName: row.lineName },
        };
    }
    const found = brand
      ? await this.db
          .prepare("SELECT id,name FROM brands WHERE slug=?")
          .bind(brand)
          .first<{ id: string; name: string }>()
      : null;
    return { brand: found ?? null, line: null };
  }
  /**
   * A brand's lines in a country with their current flavors, those in
   * `foodId` first, for "Already listed from [brand]". Discontinued and
   * archived products are left out.
   */
  async brandLines(
    brandId: string,
    country: string,
    foodId: string | null,
  ): Promise<BrandLine[]> {
    const rows = await this.db
      .prepare(
        `SELECT f.id AS lineId,f.canonical_name AS lineName,p.id AS productId,p.slug,p.name,p.flavor,
          COALESCE((SELECT json_group_array(json_object('id',c.id,'slug',c.slug,'name',c.name)) FROM product_categories pc JOIN categories c ON c.id=pc.category_id AND c.is_active=1 WHERE pc.product_id=p.id),'[]') AS foods
        FROM product_families f JOIN countries co ON co.id=f.country_id AND co.iso2=? AND co.is_active=1
        JOIN products p ON p.product_family_id=f.id AND p.lifecycle_status IN ('active','under_review')
        WHERE f.brand_id=? ORDER BY f.canonical_name,f.id,p.flavor IS NOT NULL,p.flavor,p.name LIMIT 500`,
      )
      .bind(country, brandId)
      .all<{
        lineId: string;
        lineName: string;
        productId: string;
        slug: string;
        name: string;
        flavor: string | null;
        foods: string;
      }>();
    const lines = new Map<string, BrandLine>();
    for (const row of rows.results) {
      const line = lines.get(row.lineId) ?? {
        lineId: row.lineId,
        name: row.lineName,
        foods: [],
        flavors: [],
      };
      const foods = JSON.parse(row.foods) as BrandLine["foods"];
      for (const food of foods)
        if (!line.foods.some((f) => f.id === food.id)) line.foods.push(food);
      line.flavors.push({
        productId: row.productId,
        slug: row.slug,
        name: row.name,
        flavor: row.flavor,
        foods: foods.map((food) => food.slug),
      });
      lines.set(row.lineId, line);
    }
    const inFood = (line: BrandLine) =>
      foodId !== null && line.foods.some((f) => f.id === foodId);
    // Stable: lines in the food first, each group in name order.
    return [...lines.values()].sort(
      (a, b) => Number(inFood(b)) - Number(inFood(a)),
    );
  }
  /**
   * Products a new one may duplicate. An exact identity always comes first and
   * blocks publication. Otherwise, by default, the milestone 6 rule decides
   * the near-duplicate hold: the same brand or the whole name, sharing two
   * words (one for a one-word name). `loose` widens what is shown while
   * typing (milestone 7): any brand, one shared word of three or more
   * letters, brands that match the typed brand loosely first. The chosen
   * line's flavors are siblings, never near-duplicates.
   */
  async candidates(
    input: SubmissionIdentity,
    context: SubmissionContext,
    { loose = false }: { loose?: boolean } = {},
  ): Promise<Candidate[]> {
    const exact = await this.db
      .prepare(
        `SELECT p.id,p.slug,p.name,b.name AS brand,p.country_id AS countryId FROM product_identity_keys k
      JOIN products original ON original.id=k.product_id LEFT JOIN duplicate_consolidations d ON d.donor_id=original.id AND d.active=1
      JOIN products p ON p.id=COALESCE(d.survivor_id,original.id) LEFT JOIN brands b ON b.id=p.brand_id WHERE k.identity_key=?`,
      )
      .bind(context.identity)
      .first<Omit<Candidate, "exact">>();
    if (exact) return [{ ...exact, exact: true }];
    const tokens = input.name.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const significant = [...new Set(tokens.filter((t) => t.length > 2))];
    const like = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
    const nameLike = like(input.name.slice(0, 40));
    // The database ranks the brand's catalog by shared name tokens, so a large
    // brand never prevents a check and the closest entries survive the limit.
    const hits =
      significant
        .slice(0, 8)
        .map(() => "(names LIKE ? ESCAPE '\\')")
        .join("+") || "0";
    // While typing, brands matching the typed one loosely come first.
    const brandIds = loose
      ? (await matchingBrands(this.db, context.countryId, input.brand, 20)).map(
          (brand) => brand.id,
        )
      : [];
    if (context.brandId && loose) brandIds.push(context.brandId);
    const rows = await this.db
      .prepare(
        `WITH scoped AS (
      SELECT p.id,p.slug,p.name,b.name AS brand,p.country_id AS countryId,p.name LIKE ? ESCAPE '\\' AS containsName,
      p.brand_id IN (SELECT value FROM json_each(?)) AS brandMatch,
      COALESCE(p.product_family_id=?,0) AS inLine,
      COALESCE((SELECT json_group_array(alias) FROM product_aliases WHERE product_id=p.id),'[]') AS aliases,
      p.name||' '||COALESCE((SELECT group_concat(alias,' ') FROM product_aliases WHERE product_id=p.id),'') AS names
      FROM products p LEFT JOIN brands b ON b.id=p.brand_id WHERE p.country_id=? AND p.lifecycle_status<>'hidden'
      AND (${loose ? "1" : "p.brand_id=? OR p.name LIKE ? ESCAPE '\\'"})
    ), scored AS (SELECT *,${hits} AS hits FROM scoped)
    SELECT id,slug,name,brand,countryId,aliases,inLine FROM scored WHERE containsName OR hits>0
    ORDER BY ${loose ? "brandMatch DESC,hits DESC,containsName DESC" : "containsName DESC,hits DESC"},name,id LIMIT 100`,
      )
      .bind(
        nameLike,
        JSON.stringify(brandIds),
        input.lineId ?? null,
        context.countryId,
        ...(loose ? [] : [context.brandId, nameLike]),
        ...significant.slice(0, 8).map(like),
      )
      .all<Omit<Candidate, "exact"> & { aliases: string; inLine: number }>();
    const candidates = rows.results.flatMap((row, order) => {
      const names = [row.name, ...(JSON.parse(row.aliases) as string[])];
      const same =
        normalizeName(row.brand ?? "") === normalizeName(context.brandName) &&
        names.some((name) => productName(name) === productName(input.name));
      const shared = (name: string) =>
        significant.filter((token) => name.toLowerCase().includes(token))
          .length;
      const similar =
        !row.inLine &&
        names.some(
          (name) =>
            shared(name) >=
            (loose ? 1 : Math.min(2, Math.max(1, tokens.length))),
        );
      return same || similar
        ? [
            {
              order,
              candidate: {
                id: row.id,
                slug: row.slug,
                name: row.name,
                brand: row.brand,
                countryId: row.countryId,
                exact: same,
              },
            },
          ]
        : [];
    });
    // Exact matches decide publication, so they are never cut by the limit.
    return candidates
      .sort(
        (a, b) =>
          Number(b.candidate.exact) - Number(a.candidate.exact) ||
          a.order - b.order,
      )
      .slice(0, 12)
      .map((c) => c.candidate);
  }
}
