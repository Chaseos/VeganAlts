import type { RankedProduct } from "../domain/policy";
import {
  eligibleProductSql,
  rankedMembershipSql,
  rankedSampleSql,
  rankingOrderSql,
} from "./read-policy";

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
      JOIN products p ON p.id = v.product_id AND ${eligibleProductSql}
      ${rankedMembershipSql}
      JOIN countries country ON country.id = p.country_id AND country.is_active = 1
      WHERE p.country_id = ? AND s.category_id = ? AND ${rankedSampleSql}
      ORDER BY ${rankingOrderSql} LIMIT ?`,
      )
      .bind(countryId, categoryId, Math.min(100, Math.max(1, limit)))
      .all<RankingRow>();
    return result.results;
  }
}
