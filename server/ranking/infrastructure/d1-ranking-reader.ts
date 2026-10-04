import type { RankedProduct } from "../domain/policy";

export interface RankingRow extends RankedProduct {
  versionId: string;
  name: string;
  rawAverage: number;
  triedCount: number;
}

export class D1RankingReader {
  constructor(private readonly db: D1Database) {}

  async top(
    countryId: string,
    categoryId: string,
    limit = 50,
  ): Promise<RankingRow[]> {
    const result = await this.db
      .prepare(
        `SELECT p.id AS productId, v.id AS versionId, p.name,
      s.rating_count AS ratingCount, s.raw_average AS rawAverage, s.bayesian_score AS bayesianScore, s.tried_count AS triedCount
      FROM product_category_stats s
      JOIN product_versions v ON v.id = s.product_version_id AND v.is_current = 1
      JOIN products p ON p.id = v.product_id AND p.lifecycle_status = 'active' AND p.vegan_status <> 'under_review'
      JOIN product_categories pc ON pc.product_id = p.id AND pc.category_id = s.category_id AND pc.ranking_eligible = 1
      JOIN categories c ON c.id = s.category_id AND c.is_active = 1 AND c.is_rankable = 1
      JOIN countries country ON country.id = p.country_id AND country.is_active = 1
      WHERE p.country_id = ? AND s.category_id = ? AND s.rating_count > 0 AND s.bayesian_score IS NOT NULL
      ORDER BY s.bayesian_score DESC, s.rating_count DESC, p.id ASC LIMIT ?`,
      )
      .bind(countryId, categoryId, Math.min(100, Math.max(1, limit)))
      .all<RankingRow>();
    return result.results;
  }
}
