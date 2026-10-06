import type {
  MyRating,
  PersonalRating,
  PersonalRatingsRepository,
  RatingCursor,
} from "../domain/contracts";

export class D1PersonalRatingsRepository implements PersonalRatingsRepository {
  constructor(private readonly db: D1Database) {}
  async state(userId: string, versionIds: string[]) {
    if (!versionIds.length) return { ratings: [], triedVersionIds: [] };
    const placeholders = versionIds.map(() => "?").join(",");
    const [ratings, trials] = await this.db.batch([
      this.db
        .prepare(
          `SELECT id,product_version_id AS productVersionId,category_id AS categoryId,overall_similarity AS overallSimilarity,updated_at AS updatedAt FROM ratings WHERE user_id=? AND product_version_id IN (${placeholders}) LIMIT 2000`,
        )
        .bind(userId, ...versionIds),
      this.db
        .prepare(
          `SELECT product_version_id AS id FROM product_trials WHERE user_id=? AND product_version_id IN (${placeholders})`,
        )
        .bind(userId, ...versionIds),
    ]);
    return {
      ratings: ratings!.results as unknown as PersonalRating[],
      triedVersionIds: (trials!.results as { id: string }[]).map(
        (row) => row.id,
      ),
    };
  }
  async list(userId: string, cursor: RatingCursor | null, limit: number) {
    return (
      await this.db
        .prepare(
          `SELECT r.id,r.product_version_id AS productVersionId,r.category_id AS categoryId,r.overall_similarity AS overallSimilarity,r.updated_at AS updatedAt,
      p.id AS productId,p.slug AS productSlug,p.name AS productName,b.name AS brand,c.slug AS categorySlug,c.name AS categoryName,v.version_label AS versionLabel,v.is_current AS isCurrent,
      CASE WHEN v.is_current=1 AND p.lifecycle_status='active' AND p.vegan_status<>'under_review' AND pc.ranking_eligible=1 AND c.is_active=1 AND c.is_rankable=1 AND country.is_active=1 THEN 1 ELSE 0 END AS canRate,
      (SELECT i.id FROM product_images i WHERE i.product_version_id=v.id AND i.slot='front' AND i.state='accepted' LIMIT 1) AS imageId
      FROM ratings r JOIN product_versions v ON v.id=r.product_version_id JOIN products p ON p.id=v.product_id JOIN countries country ON country.id=p.country_id
      LEFT JOIN brands b ON b.id=p.brand_id JOIN categories c ON c.id=r.category_id LEFT JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=c.id
      WHERE r.user_id=? ${cursor ? "AND (r.updated_at<? OR (r.updated_at=? AND r.id<?))" : ""}
      ORDER BY r.updated_at DESC,r.id DESC LIMIT ?`,
        )
        .bind(
          userId,
          ...(cursor ? [cursor.updatedAt, cursor.updatedAt, cursor.id] : []),
          limit,
        )
        .all<MyRating>()
    ).results;
  }
}
