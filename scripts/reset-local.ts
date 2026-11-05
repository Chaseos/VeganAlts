import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Recreates the local D1 database from version 1 with the demo catalog, or,
// with --taxonomy-only, with the taxonomy alone (the store-photo import's
// rehearsal starts without demo data, docs/IMPORTER_PLAN.md).
const args = process.argv.slice(2);
const taxonomyOnly = args.includes("--taxonomy-only");
if (
  !args.includes("--confirm-local-reset") ||
  args.some(
    (arg) => !["--confirm-local-reset", "--taxonomy-only"].includes(arg),
  )
)
  throw new Error(
    "Pass --confirm-local-reset to erase only this project's local D1 database (add --taxonomy-only to leave out the demo catalog). Stop the dev server first.",
  );
await rm(resolve(".wrangler/state/v3/d1"), { recursive: true, force: true });
for (const script of [
  "db:migrate:local",
  taxonomyOnly ? "taxonomy:seed:local" : "db:seed:local",
]) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${script} failed.`);
}
