import { scheduleCatalogInvalidation } from "../../catalog/infrastructure/invalidation";

export async function invalidateCommunityProduct(
  db: D1Database,
  productId: string,
  actionId?: string,
) {
  try {
    const product = await db
      .prepare("SELECT slug FROM products WHERE id=?")
      .bind(productId)
      .first<{ slug: string }>();
    if (!product) return;
    const [categories, images, related] = await db.batch<{
      slug: string;
      id: string;
    }>([
      db
        .prepare(
          "SELECT c.slug FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=?",
        )
        .bind(productId),
      db
        .prepare(
          "SELECT i.id FROM product_images i JOIN product_versions v ON v.id=i.product_version_id WHERE v.product_id=?",
        )
        .bind(productId),
      db
        .prepare(
          `WITH prior AS (SELECT before_data FROM moderation_actions WHERE id=?)
          SELECT p.slug FROM products p WHERE p.id IN (SELECT from_product_id FROM product_relationships WHERE to_product_id=? UNION SELECT to_product_id FROM product_relationships WHERE from_product_id=?
          UNION SELECT json_extract(value,'$.productId') FROM prior,json_each(prior.before_data,'$.relationships'))
          OR (p.product_family_id IS NOT NULL AND p.product_family_id IN (SELECT product_family_id FROM products WHERE id=? UNION SELECT json_extract(before_data,'$.familyId') FROM prior))`,
        )
        .bind(actionId ?? null, productId, productId, productId),
    ]);
    scheduleCatalogInvalidation([
      {
        kind: "product",
        slug: product.slug,
        categorySlugs: categories!.results.map((c) => c.slug),
      },
      ...images!.results.map((i) => ({ kind: "media" as const, slug: i.id })),
      ...related!.results.map((p) => ({
        kind: "product" as const,
        slug: p.slug,
      })),
    ]);
  } catch {
    console.error(
      JSON.stringify({ event: "community_invalidation_failed", productId }),
    );
  }
}
