import type {
  CategoryAggregate,
  CanonicalRating,
} from "../../ranking/domain/policy";
import type {
  FormulaSnapshot,
  RaterDetails,
  RatingMutation,
  RatingsRepository,
} from "../domain/repository";
import { isConventionalRecency } from "../domain/details";

export class D1RatingsRepository implements RatingsRepository {
  constructor(private readonly db: D1Database) {}

  async snapshot(
    versionId: string,
    raterId?: string,
  ): Promise<FormulaSnapshot | null> {
    const rows = await this.db.batch<Record<string, unknown>>([
      this.db
        .prepare(
          `SELECT revision FROM formula_revisions WHERE product_version_id = ?`,
        )
        .bind(versionId),
      this.db
        .prepare(
          `SELECT v.id, v.is_current, p.lifecycle_status, p.vegan_status, c.is_active AS country_active
        FROM product_versions v JOIN products p ON p.id = v.product_id JOIN countries c ON c.id = p.country_id WHERE v.id = ?`,
        )
        .bind(versionId),
      this.db
        .prepare(
          `SELECT c.id, c.is_active, c.is_rankable, pc.ranking_eligible FROM product_categories pc
        JOIN categories c ON c.id = pc.category_id JOIN product_versions v ON v.product_id = pc.product_id WHERE v.id = ?`,
        )
        .bind(versionId),
      this.db
        .prepare(
          `SELECT id, user_id AS userId, category_id AS categoryId, overall_similarity AS score,
        is_counted AS isCounted, created_at AS createdAt, updated_at AS updatedAt FROM ratings WHERE product_version_id = ?`,
        )
        .bind(versionId),
      this.db
        .prepare(
          `SELECT user_id FROM product_trials WHERE product_version_id = ?`,
        )
        .bind(versionId),
      this.db
        .prepare(
          `SELECT d.id, d.category_id AS categoryId, d.key, d.is_active AS isActive FROM category_rating_dimensions d
        JOIN product_categories pc ON pc.category_id = d.category_id JOIN product_versions v ON v.product_id = pc.product_id WHERE v.id = ?`,
        )
        .bind(versionId),
      // The named rater's stored details (none when no rater is named).
      this.db
        .prepare(
          `SELECT r.category_id AS categoryId, r.conventional_recency AS recency, a.dimension_id AS dimensionId, a.score
        FROM ratings r LEFT JOIN rating_dimension_values a ON a.rating_id = r.id WHERE r.product_version_id = ? AND r.user_id = ?`,
        )
        .bind(versionId, raterId ?? null),
    ]);
    const version = rows[1]!.results[0];
    if (!version) return null;
    return {
      versionId,
      revision: Number(rows[0]!.results[0]?.revision ?? 0),
      archived: version.lifecycle_status === "hidden",
      canRate:
        version.is_current === 1 &&
        version.lifecycle_status === "active" &&
        version.vegan_status !== "under_review" &&
        version.country_active === 1,
      categories: rows[2]!.results.map((row) => ({
        id: String(row.id),
        canRate:
          row.is_active === 1 &&
          row.is_rankable === 1 &&
          row.ranking_eligible === 1,
      })),
      ratings: rows[3]!.results.map(
        (row) =>
          ({
            id: String(row.id),
            userId: String(row.userId),
            categoryId: String(row.categoryId),
            score: Number(row.score),
            isCounted: row.isCounted === 1,
            createdAt: Number(row.createdAt),
            updatedAt: Number(row.updatedAt),
          }) satisfies CanonicalRating,
      ),
      triedUserIds: rows[4]!.results.map((row) => String(row.user_id)),
      dimensions: rows[5]!.results.map((row) => ({
        id: String(row.id),
        categoryId: String(row.categoryId),
        key: String(row.key),
        isActive: row.isActive === 1,
      })),
      rater: raterDetails(rows[6]!.results),
    };
  }

  async commit(
    snapshot: FormulaSnapshot,
    mutation: RatingMutation,
    aggregates: CategoryAggregate[],
    now: number,
  ) {
    const token = crypto.randomUUID();
    const versionId = snapshot.versionId;
    const fence = `EXISTS (SELECT 1 FROM formula_revisions WHERE product_version_id = ? AND write_token = ?)`;
    const statements = [
      this.db
        .prepare(
          `UPDATE formula_revisions SET revision = revision + 1, write_token = ?
      WHERE product_version_id = ? AND revision = ?`,
        )
        .bind(token, versionId, snapshot.revision),
    ];
    const trial = (userId: string) =>
      this.db
        .prepare(
          `INSERT INTO product_trials (user_id, product_version_id, created_at, updated_at)
      SELECT ?, ?, ?, ? WHERE ${fence} ON CONFLICT(user_id, product_version_id) DO UPDATE SET updated_at = excluded.updated_at`,
        )
        .bind(userId, versionId, now, now, versionId, token);

    switch (mutation.kind) {
      case "upsert": {
        const rating = mutation.rating;
        const recency = mutation.details?.recency;
        statements.push(
          trial(rating.userId),
          this.db
            .prepare(
              `INSERT INTO ratings
          (id, user_id, product_version_id, category_id, overall_similarity, conventional_recency, is_counted, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${fence}
          ON CONFLICT(user_id, product_version_id, category_id) DO UPDATE SET
            overall_similarity = excluded.overall_similarity, updated_at = excluded.updated_at,
            conventional_recency = CASE WHEN ? THEN excluded.conventional_recency ELSE ratings.conventional_recency END`,
            )
            .bind(
              rating.id,
              rating.userId,
              versionId,
              rating.categoryId,
              rating.score,
              recency?.value ?? null,
              Number(rating.isCounted),
              rating.createdAt,
              now,
              versionId,
              token,
              Number(recency !== undefined),
            ),
          ...(mutation.details?.answers ?? []).map((answer) =>
            answer.score === null
              ? this.db
                  .prepare(
                    `DELETE FROM rating_dimension_values WHERE rating_id = ? AND dimension_id = ? AND ${fence}`,
                  )
                  .bind(rating.id, answer.dimensionId, versionId, token)
              : this.db
                  .prepare(
                    `INSERT INTO rating_dimension_values (rating_id, dimension_id, score, created_at, updated_at)
              SELECT ?, ?, ?, ?, ? WHERE ${fence}
              ON CONFLICT(rating_id, dimension_id) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at`,
                  )
                  .bind(
                    rating.id,
                    answer.dimensionId,
                    answer.score,
                    now,
                    now,
                    versionId,
                    token,
                  ),
          ),
        );
        break;
      }
      case "delete":
        statements.push(
          this.db
            .prepare(
              `DELETE FROM ratings WHERE product_version_id = ? AND user_id = ? AND category_id = ? AND ${fence}`,
            )
            .bind(
              versionId,
              mutation.userId,
              mutation.categoryId,
              versionId,
              token,
            ),
        );
        break;
      case "tried":
        statements.push(
          mutation.tried
            ? trial(mutation.userId)
            : this.db
                .prepare(
                  `DELETE FROM product_trials WHERE product_version_id = ? AND user_id = ? AND ${fence}`,
                )
                .bind(versionId, mutation.userId, versionId, token),
        );
        break;
      case "exclude":
        statements.push(
          this.db
            .prepare(
              `UPDATE ratings SET is_counted = ?, updated_at = ? WHERE id = ? AND product_version_id = ? AND ${fence}`,
            )
            .bind(
              Number(mutation.counted),
              now,
              mutation.ratingId,
              versionId,
              versionId,
              token,
            ),
        );
        break;
      case "rebuild":
        break;
    }
    // Remove obsolete derived rows during rebuilds, without touching raw ratings.
    statements.push(
      this.db
        .prepare(
          `DELETE FROM product_category_stats WHERE product_version_id = ? AND ${fence}`,
        )
        .bind(versionId, versionId, token),
    );
    for (const aggregate of aggregates) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO product_category_stats
        (product_version_id, category_id, rating_count, rating_sum, raw_average, bayesian_score, tried_count, recent_rating_count, recomputed_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${fence}`,
          )
          .bind(
            versionId,
            aggregate.categoryId,
            aggregate.ratingCount,
            aggregate.ratingSum,
            aggregate.rawAverage,
            aggregate.bayesianScore,
            aggregate.triedCount,
            aggregate.recentRatingCount,
            now,
            versionId,
            token,
          ),
      );
    }
    // Detail and familiarity aggregates are recomputed from canonical counted
    // ratings in the same fenced batch, so they always match the Top counts.
    const categoryIds = JSON.stringify(
      snapshot.categories.map((category) => category.id),
    );
    statements.push(
      this.db
        .prepare(
          `DELETE FROM product_category_dimension_stats WHERE product_version_id = ? AND ${fence}`,
        )
        .bind(versionId, versionId, token),
      this.db
        .prepare(
          `INSERT INTO product_category_dimension_stats
        (product_version_id, category_id, dimension_id, answer_count, answer_sum, recomputed_at)
        SELECT r.product_version_id, r.category_id, a.dimension_id, COUNT(*), SUM(a.score), ?
        FROM ratings r JOIN rating_dimension_values a ON a.rating_id = r.id
        WHERE r.product_version_id = ? AND r.is_counted = 1 AND r.category_id IN (SELECT value FROM json_each(?)) AND ${fence}
        GROUP BY r.category_id, a.dimension_id`,
        )
        .bind(now, versionId, categoryIds, versionId, token),
      this.db
        .prepare(
          `DELETE FROM product_category_familiarity_stats WHERE product_version_id = ? AND ${fence}`,
        )
        .bind(versionId, versionId, token),
      this.db
        .prepare(
          `INSERT INTO product_category_familiarity_stats
        (product_version_id, category_id, recency, overall_similarity, rating_count, recomputed_at)
        SELECT r.product_version_id, r.category_id, COALESCE(r.conventional_recency, 'unanswered'), r.overall_similarity, COUNT(*), ?
        FROM ratings r
        WHERE r.product_version_id = ? AND r.is_counted = 1 AND r.category_id IN (SELECT value FROM json_each(?)) AND ${fence}
        GROUP BY r.category_id, COALESCE(r.conventional_recency, 'unanswered'), r.overall_similarity`,
        )
        .bind(now, versionId, categoryIds, versionId, token),
    );
    try {
      const result = await this.db.batch(statements);
      return result[0]!.meta.changes === 1;
    } catch (error) {
      // SQLite aborts the transaction on snapshot contention. Recompute via the
      // same bounded optimistic retry; other storage failures still propagate.
      if (
        error instanceof Error &&
        /SQLITE_BUSY(?:_SNAPSHOT)?\b/.test(error.message)
      )
        return false;
      throw error;
    }
  }

  async listVersionIds(after: string | null, limit: number) {
    const result = await this.db
      .prepare(
        `SELECT id FROM product_versions WHERE (? IS NULL OR id > ?) ORDER BY id LIMIT ?`,
      )
      .bind(after, after, limit)
      .all<{ id: string }>();
    return result.results.map((row) => row.id);
  }
}

function raterDetails(rows: Record<string, unknown>[]): RaterDetails[] {
  const byCategory = new Map<string, RaterDetails>();
  for (const row of rows) {
    const categoryId = String(row.categoryId);
    let details = byCategory.get(categoryId);
    if (!details) {
      details = {
        categoryId,
        conventionalRecency: isConventionalRecency(row.recency)
          ? row.recency
          : null,
        answers: {},
      };
      byCategory.set(categoryId, details);
    }
    if (typeof row.dimensionId === "string")
      details.answers[row.dimensionId] = Number(row.score);
  }
  return [...byCategory.values()];
}
