import { scheduleCatalogInvalidation } from "../../catalog/infrastructure/invalidation";

export async function invalidateCommunityProduct(
  db: D1Database,
  productId: string,
  {
    actionId,
    scope = "all",
  }: { actionId?: string; scope?: "page" | "listings" | "all" } = {},
) {
  try {
    const product = await db
      .prepare(
        "SELECT p.slug,lower(co.iso2) AS country FROM products p JOIN countries co ON co.id=p.country_id WHERE p.id=?",
      )
      .bind(productId)
      .first<{ slug: string; country: string }>();
    if (!product) return;
    if (scope === "page") {
      scheduleCatalogInvalidation([
        {
          kind: "product",
          slug: product.slug,
          country: product.country,
          scope,
        },
      ]);
      return;
    }
    // Purge only photos whose visibility this action changed. Hiding or
    // restoring a product changes every photo's public availability.
    const [categories, images, related] = await db.batch<{
      slug: string;
      id: string;
      country: string;
    }>([
      // Current memberships plus any this action linked or unlinked, so a
      // category the product just left is purged too.
      db
        .prepare(
          `WITH action AS (SELECT before_data,after_data FROM moderation_actions WHERE id=?)
          SELECT c.slug FROM categories c WHERE c.id IN (
            SELECT category_id FROM product_categories WHERE product_id=?
            UNION SELECT value FROM action,json_each(action.before_data,'$.addedCategories')
            UNION SELECT value FROM action,json_each(action.before_data,'$.removedCategories')
            UNION SELECT value FROM action,json_each(action.after_data,'$.addedCategories')
            UNION SELECT value FROM action,json_each(action.after_data,'$.removedCategories'))`,
        )
        .bind(actionId ?? null, productId),
      db
        .prepare(
          `WITH action AS (SELECT before_data,after_data FROM moderation_actions WHERE id=?)
          SELECT i.id FROM product_images i JOIN product_versions v ON v.id=i.product_version_id WHERE v.product_id=? AND (
            i.id IN (SELECT json_extract(value,'$.id') FROM action,json_each(action.before_data,'$.imageStates')
              UNION SELECT json_extract(value,'$.id') FROM action,json_each(action.after_data,'$.imageStates'))
            OR EXISTS(SELECT 1 FROM action WHERE 'hidden' IN (json_extract(before_data,'$.lifecycleStatus'),json_extract(after_data,'$.lifecycleStatus'))))`,
        )
        .bind(actionId ?? null, productId),
      db
        .prepare(
          `WITH prior AS (SELECT before_data FROM moderation_actions WHERE id=?)
          SELECT p.slug,lower(co.iso2) AS country FROM products p JOIN countries co ON co.id=p.country_id WHERE p.id IN (SELECT from_product_id FROM product_relationships WHERE to_product_id=? UNION SELECT to_product_id FROM product_relationships WHERE from_product_id=?
          UNION SELECT json_extract(value,'$.productId') FROM prior,json_each(prior.before_data,'$.relationships'))
          OR (p.product_family_id IS NOT NULL AND p.product_family_id IN (SELECT product_family_id FROM products WHERE id=? UNION SELECT json_extract(before_data,'$.familyId') FROM prior))`,
        )
        .bind(actionId ?? null, productId, productId, productId),
    ]);
    scheduleCatalogInvalidation([
      {
        kind: "product",
        slug: product.slug,
        country: product.country,
        categorySlugs: categories!.results.map((c) => c.slug),
        scope,
      },
      ...images!.results.map((i) => ({ kind: "media" as const, slug: i.id })),
      ...related!.results.map((p) => ({
        kind: "product" as const,
        slug: p.slug,
        country: p.country,
      })),
    ]);
  } catch {
    console.error(
      JSON.stringify({ event: "community_invalidation_failed", productId }),
    );
  }
}
