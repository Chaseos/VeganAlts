import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { v7 as uuid } from "uuid";
import { taxonomySeedSql } from "../db/seed/taxonomy";

// Taxonomy-only and idempotent: categories, aliases and initial homepage
// features, never products, ratings, people or images. Production requires an
// explicit confirmation flag in addition to the environment name.
const environment = process.argv[2];
if (!["local", "staging", "production"].includes(environment ?? ""))
  throw new Error("Choose local, staging or production explicitly.");
if (
  environment === "production" &&
  !process.argv.includes("--confirm-taxonomy-only")
)
  throw new Error(
    "Production taxonomy seeding requires --confirm-taxonomy-only after reviewing db/seed/taxonomy.ts.",
  );
const directory = await mkdtemp(join(tmpdir(), "veganalts-taxonomy-"));
try {
  const file = join(directory, "taxonomy.sql");
  await writeFile(file, taxonomySeedSql(uuid, Date.now()));
  const flags =
    environment === "local"
      ? ["--local", "--env="]
      : ["--remote", "--env", environment!];
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
      `Taxonomy seed failed. Re-running is safe. ${result.stderr?.slice(-1000) ?? ""}`,
    );
  console.log(JSON.stringify({ environment, taxonomySeeded: true }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
