import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

if (process.argv.slice(2).join(" ") !== "--confirm-local-reset")
  throw new Error(
    "Pass --confirm-local-reset to erase only this project's local D1 database. Stop the dev server first.",
  );
await rm(resolve(".wrangler/state/v3/d1"), { recursive: true, force: true });
for (const script of ["db:migrate:local", "db:seed:local"]) {
  const result = spawnSync("npm", ["run", script], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${script} failed.`);
}
