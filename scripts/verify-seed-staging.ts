import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { withCatalogPlatform } from "./catalog-platform";

if (process.argv[2] !== "--staging")
  throw new Error("Pass --staging to verify repeatable development seeding.");
const snapshot = () =>
  withCatalogPlatform("staging", async ({ DB }) => {
    const groups = {
      realAccounts:
        "SELECT u.id,pr.handle,pr.display_name,pr.account_state FROM user u LEFT JOIN profiles pr ON pr.user_id=u.id WHERE u.email NOT LIKE '%@demo.veganalts.invalid' ORDER BY u.id",
      realRatings:
        "SELECT r.* FROM ratings r JOIN user u ON u.id=r.user_id WHERE u.email NOT LIKE '%@demo.veganalts.invalid' ORDER BY r.id",
      realTrials:
        "SELECT t.* FROM product_trials t JOIN user u ON u.id=t.user_id WHERE u.email NOT LIKE '%@demo.veganalts.invalid' ORDER BY t.user_id,t.product_version_id",
      verifiedFormulas:
        "SELECT id,verified_at FROM product_versions WHERE verified_at IS NOT NULL ORDER BY id",
      historicalFormulas:
        "SELECT * FROM product_versions WHERE is_current=0 ORDER BY id",
      catalogProducts: "SELECT * FROM products ORDER BY id",
      currentFormulas:
        "SELECT * FROM product_versions WHERE is_current=1 ORDER BY id",
      formulaClassifications:
        "SELECT * FROM formula_classifications ORDER BY product_version_id",
      categoryMemberships:
        "SELECT * FROM product_categories ORDER BY product_id,category_id",
      productRelationships:
        "SELECT * FROM product_relationships ORDER BY from_product_id,to_product_id,relation_type",
      retailers: "SELECT * FROM retailers ORDER BY id",
      retailerConfirmations:
        "SELECT * FROM retailer_confirmations ORDER BY user_id,product_id,retailer_id",
      proposals: "SELECT * FROM edit_proposals ORDER BY id",
      reports: "SELECT * FROM reports ORDER BY id",
      moderationActions: "SELECT * FROM moderation_actions ORDER BY id",
      duplicateConsolidations:
        "SELECT * FROM duplicate_consolidations ORDER BY donor_id",
      auditHistory: "SELECT * FROM audit_log ORDER BY id",
    };
    const summary: Record<string, { count: number; sha256: string }> = {};
    for (const [name, sql] of Object.entries(groups)) {
      const { results } = await DB.prepare(sql).all();
      summary[name] = {
        count: results.length,
        sha256: createHash("sha256")
          .update(JSON.stringify(results))
          .digest("hex"),
      };
    }
    return summary;
  });
const before = await snapshot();
execFileSync("npm", ["run", "db:seed:staging"], {
  stdio: "ignore",
  timeout: 180000,
});
const after = await snapshot();
assert.deepEqual(after, before, "Reseeding changed protected staging records");
const report = {
  checkedAt: new Date().toISOString(),
  verified: true,
  protectedRecords: after,
};
await mkdir("test-results/milestone-3", { recursive: true });
await writeFile(
  "test-results/milestone-3/seed-preservation.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
