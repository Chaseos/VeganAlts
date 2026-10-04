import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { developmentSeedStatements, seedSql } from "../db/seed/statements";

const environment = process.argv[2];
if (environment !== "local" && environment !== "staging")
  throw new Error(
    "Usage: npm run db:seed:local or npm run db:seed:staging. Production seeding is prohibited.",
  );
const directory = await mkdtemp(join(tmpdir(), "veganalts-seed-"));
try {
  const file = join(directory, "development.sql");
  await writeFile(file, seedSql(developmentSeedStatements(environment)));
  const flags =
    environment === "local"
      ? ["--local", "--env="]
      : ["--remote", "--env", "staging"];
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--config",
      "wrangler.jsonc",
      ...flags,
      "--file",
      file,
      "--yes",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error("Seed execution failed. Re-running is safe.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
