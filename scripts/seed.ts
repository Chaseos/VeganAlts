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
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(
      `Seed execution failed. Re-running is safe. ${result.stderr?.slice(-1000) ?? ""}`,
    );
  console.log(JSON.stringify({ environment, catalogSeeded: true }));
  const rebuild = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/rebuild-rankings.ts", environment],
    { stdio: "inherit" },
  );
  if (rebuild.status !== 0)
    throw new Error(
      "Catalog seeded, but aggregate rebuild failed. Re-run the seed command before using rankings.",
    );
} finally {
  await rm(directory, { recursive: true, force: true });
}
