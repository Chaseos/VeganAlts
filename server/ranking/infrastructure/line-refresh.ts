import {
  INITIAL_SCORING,
  validateRankingParameters,
  type Scoring,
} from "../domain/policy";
import { RECENT_WINDOW_MS } from "../domain/lines";

// Recomputes recipe lines' standing (`family_category_stats` and
// `family_category_dimension_stats`) from canonical rows, following
// `aggregateLine` in ranking/domain/lines.ts. The statements join the batch
// that changes a line, so a D1 transaction never leaves a line stale; the
// hourly job re-derives lines in turn as a backstop.

export interface LineTargets {
  familyIds?: readonly (string | null | undefined)[];
  productIds?: readonly string[];
  versionIds?: readonly string[];
}

// ?1 line IDs, ?2 product IDs, ?3 formula IDs (each a JSON array).
const TARGETS = `targets(id) AS (
  SELECT value FROM json_each(?1)
  UNION SELECT product_family_id FROM products WHERE id IN (SELECT value FROM json_each(?2))
  UNION SELECT p.product_family_id FROM product_versions v JOIN products p ON p.id=v.product_id WHERE v.id IN (SELECT value FROM json_each(?3))
)`;
// The line's eligible flavors in each food: the current formula of an
// active product that isn't under review, ranking-eligible in the food.
const ELIGIBLE = `eligible AS (
  SELECT p.product_family_id AS family_id,pc.category_id,p.id AS product_id,v.id AS version_id,p.published_at
  FROM targets t
  JOIN products p ON p.product_family_id=t.id
  JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
  JOIN product_categories pc ON pc.product_id=p.id AND pc.ranking_eligible=1
  WHERE p.lifecycle_status='active' AND p.vegan_status<>'under_review'
)`;
const RATED = `rated AS (
  SELECT e.family_id,e.category_id,e.product_id,r.id AS rating_id,r.user_id,r.overall_similarity AS similarity,r.enjoyment,r.created_at
  FROM eligible e
  JOIN ratings r ON r.product_version_id=e.version_id AND r.category_id=e.category_id AND r.is_counted=1
)`;

// ?4 now, ?5 Closest C·m, ?6 Closest m, ?7 Tastiest C·m, ?8 Tastiest m,
// ?9 the start of the recent window.
const INSERT_STATS = `WITH ${TARGETS},${ELIGIBLE},${RATED},
person AS (
  SELECT family_id,category_id,user_id,AVG(similarity) AS similarity,AVG(enjoyment) AS enjoyment,MAX(created_at) AS latest
  FROM rated GROUP BY family_id,category_id,user_id
),
line AS (
  SELECT family_id,category_id,COUNT(*) AS people,SUM(similarity) AS mean_sum,
    COUNT(enjoyment) AS enjoying,TOTAL(enjoyment) AS enjoyment_sum,SUM(latest>=?9) AS recent
  FROM person GROUP BY family_id,category_id
),
tried AS (
  SELECT e.family_id,e.category_id,COUNT(DISTINCT t.user_id) AS tried
  FROM eligible e JOIN product_trials t ON t.product_version_id=e.version_id
  GROUP BY e.family_id,e.category_id
),
flavor AS (
  SELECT e.family_id,e.category_id,e.product_id,e.published_at,COUNT(r.rating_id) AS n,TOTAL(r.similarity) AS total
  FROM eligible e LEFT JOIN rated r ON r.product_id=e.product_id AND r.category_id=e.category_id
  GROUP BY e.family_id,e.category_id,e.product_id
)
INSERT INTO family_category_stats(product_family_id,category_id,people_count,mean_sum,raw_average,bayesian_score,
  enjoyment_people,enjoyment_mean_sum,enjoyment_average,enjoyment_score,tried_count,recent_count,lead_product_id,recomputed_at)
SELECT g.family_id,g.category_id,
  COALESCE(l.people,0),COALESCE(l.mean_sum,0),
  l.mean_sum/l.people,
  (l.mean_sum+?5)/(l.people+?6),
  COALESCE(l.enjoying,0),COALESCE(l.enjoyment_sum,0),
  CASE WHEN l.enjoying>0 THEN l.enjoyment_sum/l.enjoying END,
  CASE WHEN l.enjoying>0 THEN (l.enjoyment_sum+?7)/(l.enjoying+?8) END,
  COALESCE(tr.tried,0),COALESCE(l.recent,0),
  (SELECT f.product_id FROM flavor f WHERE f.family_id=g.family_id AND f.category_id=g.category_id
    ORDER BY f.n DESC,CASE WHEN f.n>0 THEN (f.total+?5)/(f.n+?6) END DESC,f.published_at IS NULL,f.published_at,f.product_id
    LIMIT 1),
  ?4
FROM (SELECT DISTINCT family_id,category_id FROM eligible) g
LEFT JOIN line l ON l.family_id=g.family_id AND l.category_id=g.category_id
LEFT JOIN tried tr ON tr.family_id=g.family_id AND tr.category_id=g.category_id`;

const INSERT_DIMENSIONS = `WITH ${TARGETS},${ELIGIBLE},${RATED},
answers AS (
  SELECT r.family_id,r.category_id,a.dimension_id,r.user_id,AVG(a.score) AS mean
  FROM rated r JOIN rating_dimension_values a ON a.rating_id=r.rating_id
  GROUP BY r.family_id,r.category_id,a.dimension_id,r.user_id
)
INSERT INTO family_category_dimension_stats(product_family_id,category_id,dimension_id,people_count,mean_sum,recomputed_at)
SELECT family_id,category_id,dimension_id,COUNT(*),SUM(mean),?4
FROM answers GROUP BY family_id,category_id,dimension_id`;

// A line's first publication in each food only ever moves earlier.
const FIRST_PUBLISHED = `WITH ${TARGETS}
INSERT INTO family_category_first_published(product_family_id,category_id,first_published_at)
SELECT p.product_family_id,pc.category_id,MIN(p.published_at)
FROM targets t JOIN products p ON p.product_family_id=t.id JOIN product_categories pc ON pc.product_id=p.id
WHERE p.published_at IS NOT NULL
GROUP BY p.product_family_id,pc.category_id
ON CONFLICT(product_family_id,category_id) DO UPDATE SET first_published_at=MIN(first_published_at,excluded.first_published_at)`;

export class LineRefresh {
  constructor(
    private readonly db: D1Database,
    private readonly scoring: Scoring,
  ) {}

  /** Statements recomputing every food row of the targeted lines. */
  statements(targets: LineTargets, now: number): D1PreparedStatement[] {
    const lists = [
      JSON.stringify([
        ...new Set((targets.familyIds ?? []).filter((id) => id)),
      ]),
      JSON.stringify(targets.productIds ?? []),
      JSON.stringify(targets.versionIds ?? []),
    ];
    const { closest, tastiest } = this.scoring;
    const scored = [
      ...lists,
      now,
      closest.priorMean * closest.priorStrength,
      closest.priorStrength,
      tastiest.priorMean * tastiest.priorStrength,
      tastiest.priorStrength,
      now - RECENT_WINDOW_MS,
    ];
    return [
      this.db
        .prepare(
          `WITH ${TARGETS} DELETE FROM family_category_stats WHERE product_family_id IN (SELECT id FROM targets)`,
        )
        .bind(...lists),
      this.db.prepare(INSERT_STATS).bind(...scored),
      this.db
        .prepare(
          `WITH ${TARGETS} DELETE FROM family_category_dimension_stats WHERE product_family_id IN (SELECT id FROM targets)`,
        )
        .bind(...lists),
      this.db.prepare(INSERT_DIMENSIONS).bind(...lists, now),
      this.db.prepare(FIRST_PUBLISHED).bind(...lists),
    ];
  }

  async refresh(targets: LineTargets, now = Date.now()) {
    await this.db.batch(this.statements(targets, now));
  }

  /** Re-derives a page of lines in ID order; the backstop and full rebuild. */
  async refreshPage(after: string | null, limit = 200, now = Date.now()) {
    const ids = (
      await this.db
        .prepare(
          "SELECT id FROM product_families WHERE (?1 IS NULL OR id>?1) ORDER BY id LIMIT ?2",
        )
        .bind(after, limit)
        .all<{ id: string }>()
    ).results.map((row) => row.id);
    if (ids.length) await this.refresh({ familyIds: ids }, now);
    return {
      refreshed: ids.length,
      next: ids.length === limit ? ids.at(-1)! : null,
    };
  }

  /**
   * The hourly backstop: up to `pages` pages from where the last run
   * stopped, starting over after the last line, so each run stays bounded
   * however large the catalog grows.
   */
  async refreshRotating(pages = 25, now = Date.now()) {
    let after =
        (await this.db
          .prepare(
            "SELECT cursor FROM community_recovery WHERE prefix='line-refresh'",
          )
          .first<string | null>("cursor")) ?? null,
      refreshed = 0;
    for (let page = 0; page < pages; page++) {
      const result = await this.refreshPage(after, 200, now);
      refreshed += result.refreshed;
      after = result.next;
      if (!after) break;
    }
    await this.db
      .prepare(
        "INSERT INTO community_recovery(prefix,cursor) VALUES('line-refresh',?) ON CONFLICT(prefix) DO UPDATE SET cursor=excluded.cursor",
      )
      .bind(after)
      .run();
    return refreshed;
  }

  /** Every line, a page at a time. */
  async refreshAll(now = Date.now()) {
    let after: string | null = null,
      refreshed = 0;
    do {
      const page = await this.refreshPage(after, 200, now);
      refreshed += page.refreshed;
      after = page.next;
    } while (after);
    return refreshed;
  }
}

type ScoringEnv = Partial<
  Pick<
    Cloudflare.Env,
    | "RANKING_PRIOR_MEAN"
    | "RANKING_PRIOR_STRENGTH"
    | "RANKING_TASTIEST_PRIOR_MEAN"
    | "RANKING_TASTIEST_PRIOR_STRENGTH"
  >
>;
/** Both rankings' priors from the environment; tests may omit them. */
export function scoringFromEnv(env: ScoringEnv): Scoring {
  const prior = (
    mean: string | undefined,
    strength: string | undefined,
    fallback: Scoring["closest"],
  ) =>
    validateRankingParameters({
      priorMean: mean === undefined ? fallback.priorMean : Number(mean),
      priorStrength:
        strength === undefined ? fallback.priorStrength : Number(strength),
    });
  return {
    closest: prior(
      env.RANKING_PRIOR_MEAN,
      env.RANKING_PRIOR_STRENGTH,
      INITIAL_SCORING.closest,
    ),
    tastiest: prior(
      env.RANKING_TASTIEST_PRIOR_MEAN,
      env.RANKING_TASTIEST_PRIOR_STRENGTH,
      INITIAL_SCORING.tastiest,
    ),
  };
}

export const lineRefresh = (env: ScoringEnv & Pick<Cloudflare.Env, "DB">) =>
  new LineRefresh(env.DB, scoringFromEnv(env));
