import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { v7 as uuid } from "uuid";
import {
  PRODUCTION_COUNTRIES,
  TAXONOMY_LEAVES,
  taxonomySeedSql,
} from "../db/seed/taxonomy";

// Taxonomy-only and idempotent: categories, aliases and initial homepage
// features, never products, ratings, people or images. Production requires an
// explicit confirmation flag in addition to the environment name.
const environment = process.argv[2];
if (!["local", "staging", "production"].includes(environment ?? ""))
  throw new Error("Choose local, staging or production explicitly.");
const onlyFoodArgs = process.argv.filter((argument) =>
  argument.startsWith("--only-food="),
);
if (onlyFoodArgs.length > 1)
  throw new Error("Pass --only-food=<slug> at most once.");
const onlyFood = onlyFoodArgs[0]?.slice("--only-food=".length);
if (
  onlyFoodArgs.length > 0 &&
  (!onlyFood || !TAXONOMY_LEAVES.some((leaf) => leaf.slug === onlyFood))
)
  throw new Error(`Unknown food slug: ${onlyFood}`);
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
  const onlyFoods = onlyFoodArgs.length > 0 ? [onlyFood!] : undefined;
  await writeFile(
    file,
    taxonomySeedSql(uuid, Date.now(), {
      onlyFoods,
      liveCountries:
        environment === "production" ? PRODUCTION_COUNTRIES : undefined,
    }),
  );
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
  console.log(
    JSON.stringify({
      environment,
      taxonomySeeded: true,
      ...(onlyFoods ? { foods: onlyFoods } : {}),
    }),
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
