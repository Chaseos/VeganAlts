import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { taxonomyShape } from "../server/taxonomy/domain/shape";

// Read-only launch-dataset audit. It reports counts and record identifiers
// only (never names, emails or contribution text) so the output can be kept
// as evidence. Nothing is written to the database.
const environment = process.argv[2];
if (!["local", "staging", "production"].includes(environment ?? ""))
  throw new Error("Choose local, staging or production explicitly.");
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const target = environment === "local" ? source : source.env[environment!];
const remote = environment !== "local";

const checks: Record<string, string> = {
  developmentProducts:
    "SELECT p.id,(SELECT iso2 FROM countries WHERE id=p.country_id) AS country FROM products p WHERE p.development_only=1 AND p.lifecycle_status<>'hidden'",
  demoAccounts:
    "SELECT user_id AS id FROM profiles WHERE handle LIKE 'demo\\_%' ESCAPE '\\' OR user_id IN (SELECT id FROM user WHERE email LIKE '%.invalid' AND id<>'veganalts-system')",
  productsWithoutFrontPhoto: `SELECT p.id,(SELECT iso2 FROM countries WHERE id=p.country_id) AS country FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
    WHERE p.lifecycle_status<>'hidden' AND NOT EXISTS(SELECT 1 FROM product_images i WHERE i.product_version_id=v.id AND i.slot='front' AND i.state='accepted')`,
  productsWithoutIngredientEvidence: `SELECT p.id,(SELECT iso2 FROM countries WHERE id=p.country_id) AS country FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
    LEFT JOIN formula_classifications f ON f.product_version_id=v.id
    WHERE p.lifecycle_status<>'hidden' AND NOT EXISTS(SELECT 1 FROM product_images i WHERE i.product_version_id=v.id AND i.slot='ingredients' AND i.state='accepted')
    AND COALESCE(json_array_length(f.evidence_data,'$.urls'),0)=0`,
  veganWithoutReview: `SELECT p.id,(SELECT iso2 FROM countries WHERE id=p.country_id) AS country FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
    LEFT JOIN formula_classifications f ON f.product_version_id=v.id
    WHERE p.lifecycle_status<>'hidden' AND p.vegan_status='vegan' AND f.reviewed_by IS NULL`,
  possibleDuplicates: `SELECT group_concat(p.id) AS id,(SELECT iso2 FROM countries WHERE id=p.country_id) AS country FROM products p WHERE p.lifecycle_status<>'hidden'
    GROUP BY p.country_id,COALESCE(p.brand_id,''),lower(trim(p.name)) HAVING COUNT(*)>1`,
  emptyRankableCategories: `SELECT c.id FROM categories c WHERE c.is_active=1 AND c.is_rankable=1
    AND NOT EXISTS(SELECT 1 FROM product_categories pc JOIN products p ON p.id=pc.product_id WHERE pc.category_id=c.id AND pc.ranking_eligible=1 AND p.lifecycle_status='active')`,
  categoriesWithoutAliases: `SELECT c.id FROM categories c WHERE c.is_active=1 AND c.is_rankable=1 AND NOT EXISTS(SELECT 1 FROM category_aliases a WHERE a.category_id=c.id)`,
  pendingModeration: `SELECT id FROM edit_proposals WHERE status='pending' UNION ALL SELECT id FROM category_proposals WHERE status='pending'
    UNION ALL SELECT submission_id FROM pending_submissions WHERE resolved_at IS NULL UNION ALL SELECT id FROM reports WHERE status IN ('open','reviewing')
    UNION ALL SELECT id FROM comments WHERE moderation_state='pending' AND deleted_at IS NULL`,
  // Milestone 5: every food asks questions, every country has its lists.
  foodsWithoutQuestions: `SELECT c.id FROM categories c WHERE c.is_active=1 AND c.is_rankable=1
    AND NOT EXISTS(SELECT 1 FROM category_rating_dimensions d WHERE d.category_id=c.id AND d.is_active=1)`,
  countriesWithoutAllergenList: `SELECT co.iso2 AS id FROM countries co WHERE co.is_active=1
    AND NOT EXISTS(SELECT 1 FROM country_allergens a WHERE a.country_id=co.id)`,
  countriesWithoutFeatures: `SELECT co.iso2 AS id FROM countries co WHERE co.is_active=1
    AND NOT EXISTS(SELECT 1 FROM category_features f JOIN categories c ON c.id=f.category_id AND c.is_active=1 WHERE f.country_id=co.id)`,
  productsByCountry: `SELECT co.iso2 AS id,co.iso2 AS country FROM products p JOIN countries co ON co.id=p.country_id WHERE p.lifecycle_status<>'hidden'`,
};

const directory = await mkdtemp(join(tmpdir(), "veganalts-audit-"));
try {
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: `veganalts-audit-${environment}`,
      account_id: source.account_id,
      compatibility_date: source.compatibility_date,
      d1_databases: target.d1_databases.map(
        (binding: Record<string, unknown>) => ({ ...binding, remote }),
      ),
    }),
  );
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath,
    remoteBindings: remote,
    persist: { path: resolve(".wrangler/state/v3") },
  });
  try {
    const report: Record<
      string,
      { count: number; sample: string[]; byCountry?: Record<string, number> }
    > = {};
    for (const [name, sql] of Object.entries(checks)) {
      const rows = (
        await proxy.env.DB.prepare(sql).all<{ id: string; country?: string }>()
      ).results;
      const byCountry: Record<string, number> = {};
      for (const row of rows)
        if (row.country)
          byCountry[row.country] = (byCountry[row.country] ?? 0) + 1;
      report[name] = {
        count: rows.length,
        sample: rows.slice(0, 10).map((r) => String(r.id)),
        ...(Object.keys(byCountry).length ? { byCountry } : {}),
      };
    }
    // Foods the aisle bar cannot place (not Food → aisle → shelf → food).
    const categories = (
      await proxy.env.DB.prepare(
        "SELECT id,slug,name,parent_id AS parentId,is_rankable AS isRankable FROM categories WHERE is_active=1",
      ).all<{
        id: string;
        slug: string;
        name: string;
        parentId: string | null;
        isRankable: number;
      }>()
    ).results;
    const outside = [...taxonomyShape(categories).values()].filter(
      (node) => node.outsideDepth,
    );
    report.categoriesOutsideDepthThree = {
      count: outside.length,
      sample: outside.slice(0, 10).map((node) => node.id),
    };
    const blocking = [
      "developmentProducts",
      "demoAccounts",
      "productsWithoutFrontPhoto",
      "productsWithoutIngredientEvidence",
      "veganWithoutReview",
      "possibleDuplicates",
      "foodsWithoutQuestions",
      "countriesWithoutAllergenList",
      "categoriesOutsideDepthThree",
    ].filter((name) => report[name]!.count > 0);
    const result = {
      environment,
      at: new Date().toISOString(),
      readyForLaunch: blocking.length === 0,
      blocking,
      report,
    };
    await mkdir("test-results/milestone-5", { recursive: true });
    await writeFile(
      `test-results/milestone-5/launch-audit-${environment}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(
      JSON.stringify({
        environment,
        readyForLaunch: result.readyForLaunch,
        blocking,
        counts: Object.fromEntries(
          Object.entries(report).map(([k, v]) => [k, v.count]),
        ),
      }),
    );
  } finally {
    await proxy.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
