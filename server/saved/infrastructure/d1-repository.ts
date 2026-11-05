import type { RatingCursor } from "../../ratings/domain/contracts";
import type {
  SavedProduct,
  SavedProductsRepository,
} from "../domain/contracts";

export class D1SavedProductsRepository implements SavedProductsRepository {
  constructor(private readonly db: D1Database) {}
  async savedIds(userId: string, productIds: string[]) {
    const placeholders = productIds.map(() => "?").join(",");
    const { results } = await this.db
      .prepare(
        `SELECT product_id AS id FROM saved_products WHERE user_id=? AND product_id IN (${placeholders})`,
      )
      .bind(userId, ...productIds)
      .all<{ id: string }>();
    return results.map((row) => row.id);
  }
  // An archived duplicate stays saveable: it can sit on someone's list, shown
  // as the product that replaced it, and removing it there can be undone.
  async exists(productId: string) {
    return !!(await this.db
      .prepare(
        `SELECT 1 AS found FROM products p LEFT JOIN duplicate_consolidations d ON d.donor_id=p.id AND d.active=1
        WHERE p.id=? AND (p.lifecycle_status<>'hidden' OR d.donor_id IS NOT NULL)`,
      )
      .bind(productId)
      .first());
  }
  async save(userId: string, productId: string, now: number) {
    await this.db
      .prepare(
        "INSERT INTO saved_products (user_id,product_id,created_at) VALUES (?,?,?) ON CONFLICT(user_id,product_id) DO NOTHING",
      )
      .bind(userId, productId, now)
      .run();
  }
  async remove(userId: string, productId: string) {
    await this.db
      .prepare("DELETE FROM saved_products WHERE user_id=? AND product_id=?")
      .bind(userId, productId)
      .run();
  }
  // Rows for hidden products stay stored, so they return if the product does.
  async list(userId: string, cursor: RatingCursor | null, limit: number) {
    const { results } = await this.db
      .prepare(
        `SELECT s.product_id AS productId,s.created_at AS savedAt,p.slug,lower(country.iso2) AS country,p.name,b.name AS brand,p.flavor,p.lifecycle_status AS lifecycleStatus,
        (SELECT i.id FROM product_versions v JOIN product_images i ON i.product_version_id=v.id AND i.slot='front' AND i.state='accepted' WHERE v.product_id=p.id AND v.is_current=1 LIMIT 1) AS imageId
        FROM saved_products s
        LEFT JOIN duplicate_consolidations d ON d.donor_id=s.product_id AND d.active=1
        JOIN products p ON p.id=COALESCE(d.survivor_id,s.product_id)
        JOIN countries country ON country.id=p.country_id AND country.is_active=1
        LEFT JOIN brands b ON b.id=p.brand_id
        WHERE s.user_id=? AND p.lifecycle_status<>'hidden' ${cursor ? "AND (s.created_at<? OR (s.created_at=? AND s.product_id<?))" : ""}
        ORDER BY s.created_at DESC,s.product_id DESC LIMIT ?`,
      )
      .bind(
        userId,
        ...(cursor ? [cursor.updatedAt, cursor.updatedAt, cursor.id] : []),
        limit,
      )
      .all<SavedProduct>();
    return results;
  }
}
