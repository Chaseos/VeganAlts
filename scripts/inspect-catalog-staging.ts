import { mkdir, writeFile } from "node:fs/promises";
import { withCatalogPlatform } from "./catalog-platform";
import {
  eligibleProductSql,
  rankedMembershipSql,
  rankedSampleSql,
  rankingOrderSql,
} from "../server/ranking/infrastructure/read-policy";

if (process.argv[2] !== "--staging")
  throw new Error("Pass --staging for read-only query measurements.");
await withCatalogPlatform("staging", async ({ DB }) => {
  const category = await DB.prepare(
    "SELECT id FROM categories WHERE slug='ground-beef'",
  ).first<{ id: string }>();
  const demo = await DB.prepare(
    "SELECT user_id FROM profiles WHERE handle='demo_taster_01'",
  ).first<{ user_id: string }>();
  if (!category || !demo)
    throw new Error("Seed the staging demo catalog first.");
  const cases = [
    {
      name: "aggregate leaderboard",
      sql: `SELECT p.id,p.name,s.bayesian_score,s.rating_count FROM product_category_stats s
        JOIN product_versions v ON v.id=s.product_version_id AND v.is_current=1
        JOIN products p ON p.id=v.product_id JOIN countries country ON country.id=p.country_id AND country.iso2='US' AND country.is_active=1
        ${rankedMembershipSql} WHERE s.category_id=? AND ${eligibleProductSql} AND ${rankedSampleSql}
        ORDER BY ${rankingOrderSql} LIMIT ? OFFSET ?`,
      values: [category.id, 21, 0],
    },
    {
      name: "bounded FTS product lookup",
      sql: `SELECT p.id,p.name FROM search_index JOIN product_versions v ON v.product_id=search_index.entity_id AND v.is_current=1
        JOIN products p ON p.id=v.product_id JOIN countries country ON country.id=p.country_id AND country.iso2='US' AND country.is_active=1
        WHERE search_index MATCH ? AND entity_type='product' AND country_code='US' AND p.lifecycle_status<>'hidden'
        ORDER BY rank,p.name,p.id LIMIT 20`,
      values: ['"beef"*'],
    },
    {
      name: "private rating cursor",
      sql: "SELECT id,product_version_id,category_id,overall_similarity,updated_at FROM ratings WHERE user_id=? AND (updated_at<? OR (updated_at=? AND id<?)) ORDER BY updated_at DESC,id DESC LIMIT 21",
      values: [
        demo.user_id,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        "ffffffff-ffff-ffff-ffff-ffffffffffff",
      ],
    },
  ];
  const measurements = [];
  for (const test of cases) {
    const plan = await DB.prepare(`EXPLAIN QUERY PLAN ${test.sql}`)
      .bind(...test.values)
      .all<{ detail: string }>();
    const result = await DB.prepare(test.sql)
      .bind(...test.values)
      .all();
    measurements.push({
      name: test.name,
      plan: plan.results.map((row) => row.detail),
      returned: result.results.length,
      rowsRead: result.meta.rows_read,
      rowsWritten: result.meta.rows_written,
      sqlDurationMs: result.meta.duration,
    });
  }
  const integrity = await DB.prepare("PRAGMA foreign_key_check").all();
  if (integrity.results.length)
    throw new Error("Foreign-key verification failed.");
  const counts = await DB.prepare(
    `SELECT
    (SELECT COUNT(*) FROM products WHERE development_only=1) AS demoProducts,
    (SELECT COUNT(*) FROM categories) AS categories,
    (SELECT COUNT(*) FROM product_versions) AS formulas,
    (SELECT COUNT(*) FROM ratings) AS ratings,
    (SELECT COUNT(*) FROM product_images WHERE state='accepted') AS acceptedImages`,
  ).first();
  const report = {
    checkedAt: new Date().toISOString(),
    counts,
    foreignKeyViolations: 0,
    measurements,
  };
  await mkdir("test-results/milestone-2", { recursive: true });
  await writeFile(
    "test-results/milestone-2/query-plans.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
});
