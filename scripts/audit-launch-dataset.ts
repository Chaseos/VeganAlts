import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";

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
    "SELECT id FROM products WHERE development_only=1 AND lifecycle_status<>'hidden'",
  demoAccounts:
    "SELECT user_id AS id FROM profiles WHERE handle LIKE 'demo\\_%' ESCAPE '\\' OR user_id IN (SELECT id FROM user WHERE email LIKE '%.invalid' AND id<>'veganalts-system')",
  productsWithoutFrontPhoto: `SELECT p.id FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
    WHERE p.lifecycle_status<>'hidden' AND NOT EXISTS(SELECT 1 FROM product_images i WHERE i.product_version_id=v.id AND i.slot='front' AND i.state='accepted')`,
  productsWithoutIngredientEvidence: `SELECT p.id FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
    LEFT JOIN formula_classifications f ON f.product_version_id=v.id
    WHERE p.lifecycle_status<>'hidden' AND NOT EXISTS(SELECT 1 FROM product_images i WHERE i.product_version_id=v.id AND i.slot='ingredients' AND i.state='accepted')
    AND COALESCE(json_array_length(f.evidence_data,'$.urls'),0)=0`,
  veganWithoutReview: `SELECT p.id FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
    LEFT JOIN formula_classifications f ON f.product_version_id=v.id
    WHERE p.lifecycle_status<>'hidden' AND p.vegan_status='vegan' AND f.reviewed_by IS NULL`,
  possibleDuplicates: `SELECT group_concat(p.id) AS id FROM products p WHERE p.lifecycle_status<>'hidden'
    GROUP BY p.country_id,COALESCE(p.brand_id,''),lower(trim(p.name)) HAVING COUNT(*)>1`,
  emptyRankableCategories: `SELECT c.id FROM categories c WHERE c.is_active=1 AND c.is_rankable=1
    AND NOT EXISTS(SELECT 1 FROM product_categories pc JOIN products p ON p.id=pc.product_id WHERE pc.category_id=c.id AND pc.ranking_eligible=1 AND p.lifecycle_status='active')`,
  categoriesWithoutAliases: `SELECT c.id FROM categories c WHERE c.is_active=1 AND c.is_rankable=1 AND NOT EXISTS(SELECT 1 FROM category_aliases a WHERE a.category_id=c.id)`,
  pendingModeration: `SELECT id FROM edit_proposals WHERE status='pending' UNION ALL SELECT id FROM category_proposals WHERE status='pending'
    UNION ALL SELECT submission_id FROM pending_submissions WHERE resolved_at IS NULL UNION ALL SELECT id FROM reports WHERE status IN ('open','reviewing')
    UNION ALL SELECT id FROM comments WHERE moderation_state='pending' AND deleted_at IS NULL`,
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
    const report: Record<string, { count: number; sample: string[] }> = {};
    for (const [name, sql] of Object.entries(checks)) {
      const rows = (await proxy.env.DB.prepare(sql).all<{ id: string }>())
        .results;
      report[name] = {
        count: rows.length,
        sample: rows.slice(0, 10).map((r) => String(r.id)),
      };
    }
    const blocking = [
      "developmentProducts",
      "demoAccounts",
      "productsWithoutFrontPhoto",
      "productsWithoutIngredientEvidence",
      "veganWithoutReview",
      "possibleDuplicates",
    ].filter((name) => report[name]!.count > 0);
    const result = {
      environment,
      at: new Date().toISOString(),
      readyForLaunch: blocking.length === 0,
      blocking,
      report,
    };
    await mkdir("test-results/milestone-4", { recursive: true });
    await writeFile(
      `test-results/milestone-4/launch-audit-${environment}.json`,
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
