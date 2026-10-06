import { env, exports as entrypoints, waitUntil } from "cloudflare:workers";
import type { MaterialCatalogChange } from "../../shared/http/public-cache";

// Persistence has already succeeded. A transient purge failure is observable,
// but must not tell a contributor that their committed change failed to save.
export function scheduleCatalogInvalidation(changes: MaterialCatalogChange[]) {
  if (env.APP_ENV === "local") return; // The local entrypoint has no shared cache.
  waitUntil(
    Promise.all(
      changes.map((change) => entrypoints.PublicCatalog.invalidate(change)),
    ).catch(() => {
      console.error(
        JSON.stringify({
          event: "catalog_invalidation_failed",
          kinds: [...new Set(changes.map((change) => change.kind))],
        }),
      );
    }),
  );
}

export async function invalidateProductMedia(
  db: D1Database,
  versionId: string,
) {
  const product = await db
    .prepare(
      "SELECT p.id,p.slug FROM product_versions v JOIN products p ON p.id=v.product_id WHERE v.id=?",
    )
    .bind(versionId)
    .first<{ id: string; slug: string }>();
  if (!product) return;
  const categories = await db
    .prepare(
      "SELECT c.slug FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=? LIMIT 100",
    )
    .bind(product.id)
    .all<{ slug: string }>();
  scheduleCatalogInvalidation([
    {
      kind: "product",
      slug: product.slug,
      categorySlugs: categories.results.map((row) => row.slug),
    },
  ]);
}
