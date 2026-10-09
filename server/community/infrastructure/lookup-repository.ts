import { ApplicationError } from "../../shared/domain/errors";
import type { Candidate, SubmissionIdentity } from "../domain/contracts";
import { identityKey, normalizeName, productName } from "../domain/policy";

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
    const categories = await this.db
      .prepare(
        `SELECT id FROM categories WHERE id IN (${input.categoryIds.map(() => "?").join(",")}) AND is_active=1 AND is_rankable=1`,
      )
      .bind(...input.categoryIds)
      .all();
    if (categories.results.length !== input.categoryIds.length)
      throw new ApplicationError(
        "INVALID_CATEGORY",
        "Choose active replacement categories.",
      );
    const brand = await this.db
      .prepare(
        "SELECT id,name FROM brands WHERE normalized_name=? OR id IN (SELECT brand_id FROM brand_aliases WHERE normalized_name=?) LIMIT 1",
      )
      .bind(normalizeName(input.brand), normalizeName(input.brand))
      .first<{ id: string; name: string }>();
    if (input.productFamilyId) {
      const family = await this.db
        .prepare("SELECT brand_id FROM product_families WHERE id=?")
        .bind(input.productFamilyId)
        .first<{ brand_id: string | null }>();
      if (!family || (family.brand_id && family.brand_id !== brand?.id))
        throw new ApplicationError(
          "INVALID_FAMILY",
          "Choose a product family belonging to this brand.",
        );
    }
    if (input.relatedProductId) {
      const related = await this.db
        .prepare(
          "SELECT country_id FROM products WHERE id=? AND lifecycle_status<>'hidden'",
        )
        .bind(input.relatedProductId)
        .first<{ country_id: string }>();
      if (!related || related.country_id !== country.id)
        throw new ApplicationError(
          "INVALID_RELATIONSHIP",
          "Variants must belong to the same country.",
        );
    }
    return {
      countryId: country.id,
      brandId: brand?.id ?? null,
      brandName: brand?.name ?? input.brand,
      identity: identityKey(country.id, brand?.name ?? input.brand, input.name),
    };
  }
  async candidates(
    input: SubmissionIdentity,
    context: SubmissionContext,
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
    const rows = await this.db
      .prepare(
        `WITH scoped AS (
      SELECT p.id,p.slug,p.name,b.name AS brand,p.country_id AS countryId,p.name LIKE ? ESCAPE '\\' AS containsName,
      COALESCE((SELECT json_group_array(alias) FROM product_aliases WHERE product_id=p.id),'[]') AS aliases,
      p.name||' '||COALESCE((SELECT group_concat(alias,' ') FROM product_aliases WHERE product_id=p.id),'') AS names
      FROM products p LEFT JOIN brands b ON b.id=p.brand_id WHERE p.country_id=? AND p.lifecycle_status<>'hidden'
      AND (p.brand_id=? OR p.name LIKE ? ESCAPE '\\')
    ), scored AS (SELECT *,${hits} AS hits FROM scoped)
    SELECT id,slug,name,brand,countryId,aliases FROM scored WHERE containsName OR hits>0
    ORDER BY containsName DESC,hits DESC,name,id LIMIT 100`,
      )
      .bind(
        nameLike,
        context.countryId,
        context.brandId,
        nameLike,
        ...significant.slice(0, 8).map(like),
      )
      .all<Omit<Candidate, "exact"> & { aliases: string }>();
    const candidates = rows.results.flatMap((row, order) => {
      const names = [row.name, ...(JSON.parse(row.aliases) as string[])];
      const same =
        normalizeName(row.brand ?? "") === normalizeName(context.brandName) &&
        names.some((name) => productName(name) === productName(input.name));
      const similar = names.some(
        (name) =>
          significant.filter((token) => name.toLowerCase().includes(token))
            .length >= Math.min(2, Math.max(1, tokens.length)),
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
