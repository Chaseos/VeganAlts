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
    const [ratings, trials, answers] = await this.db.batch([
      this.db
        .prepare(
          `SELECT id,product_version_id AS productVersionId,category_id AS categoryId,overall_similarity AS overallSimilarity,conventional_recency AS conventionalRecency,updated_at AS updatedAt FROM ratings WHERE user_id=? AND product_version_id IN (${placeholders}) LIMIT 2000`,
        )
        .bind(userId, ...versionIds),
      this.db
        .prepare(
          `SELECT product_version_id AS id FROM product_trials WHERE user_id=? AND product_version_id IN (${placeholders})`,
        )
        .bind(userId, ...versionIds),
      // Answers to retired questions stay stored but are not shown.
      this.db
        .prepare(
          `SELECT a.rating_id AS ratingId,d.key,a.score FROM rating_dimension_values a JOIN ratings r ON r.id=a.rating_id JOIN category_rating_dimensions d ON d.id=a.dimension_id AND d.is_active=1
          WHERE r.user_id=? AND r.product_version_id IN (${placeholders}) LIMIT 16000`,
        )
        .bind(userId, ...versionIds),
    ]);
    const details = new Map<string, Record<string, number>>();
    for (const row of answers!.results as {
      ratingId: string;
      key: string;
      score: number;
    }[])
      details.set(row.ratingId, {
        ...details.get(row.ratingId),
        [row.key]: row.score,
      });
    return {
      ratings: (
        ratings!.results as unknown as Omit<PersonalRating, "dimensions">[]
      ).map((rating) => ({
        ...rating,
        dimensions: details.get(rating.id) ?? {},
      })),
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
      CASE WHEN p.lifecycle_status<>'hidden' THEN (SELECT i.id FROM product_images i WHERE i.product_version_id=v.id AND i.slot='front' AND i.state='accepted' LIMIT 1) ELSE NULL END AS imageId,
      COALESCE(d.active,0) AS archivedDuplicate,survivor.slug AS canonicalSlug
      FROM ratings r JOIN product_versions v ON v.id=r.product_version_id JOIN products p ON p.id=v.product_id JOIN countries country ON country.id=p.country_id
      LEFT JOIN brands b ON b.id=p.brand_id JOIN categories c ON c.id=r.category_id LEFT JOIN product_categories pc ON pc.product_id=p.id AND pc.category_id=c.id
      LEFT JOIN duplicate_consolidations d ON d.donor_id=p.id AND d.active=1 LEFT JOIN products survivor ON survivor.id=d.survivor_id
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
