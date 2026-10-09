import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { SEARCH_INDEX_STATEMENTS } from "../server/catalog/infrastructure/search-index";

// Backup and restore drill against staging: export D1, restore it into a
// throwaway local database, compare every table and verify that each R2 object
// referenced by D1 exists. Read-only for staging. The export contains personal
// data, so it lives only in a temporary directory that is always deleted.
if (process.argv[2] !== "--staging")
  throw new Error("Pass --staging to run the read-only backup drill.");
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const staging = source.env.staging;
const directory = await mkdtemp(join(tmpdir(), "veganalts-backup-"));
const wrangler = (args: string[]) => {
  const result = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", ...args],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0)
    throw new Error(
      `wrangler ${args[0]} ${args[1]} failed: ${result.stderr?.slice(-800)}`,
    );
  return result.stdout;
};
try {
  const remoteConfig = join(directory, "remote.json");
  await writeFile(
    remoteConfig,
    JSON.stringify({
      name: "veganalts-backup-drill",
      account_id: source.account_id,
      compatibility_date: source.compatibility_date,
      d1_databases: staging.d1_databases.map((d: Record<string, unknown>) => ({
        ...d,
        remote: true,
      })),
      r2_buckets: staging.r2_buckets.map((b: Record<string, unknown>) => ({
        ...b,
        remote: true,
      })),
    }),
  );
  const remote = await getPlatformProxy<{
    DB: D1Database;
    MEDIA_BUCKET: R2Bucket;
  }>({
    configPath: remoteConfig,
    remoteBindings: true,
  });
  let tables: string[] = [];
  const remoteCounts: Record<string, number> = {};
  let objects = { referenced: 0, missing: 0 };
  try {
    // Virtual (FTS5) tables and their shadow tables are derived; they are
    // rebuilt after a restore instead of exported.
    tables = (
      await remote.env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'search_index%' AND name<>'d1_migrations' ORDER BY name",
      ).all<{ name: string }>()
    ).results.map((r) => r.name);
    for (const table of tables)
      remoteCounts[table] = (await remote.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM "${table}"`,
      ).first<number>("n"))!;
    const keys = (
      await remote.env.DB.prepare(
        `SELECT full_r2_key AS k FROM product_images WHERE state IN ('accepted','archived')
        UNION SELECT thumbnail_r2_key FROM product_images WHERE state IN ('accepted','archived')
        UNION SELECT evidence_r2_key FROM product_images WHERE state IN ('accepted','archived') AND evidence_r2_key IS NOT NULL`,
      ).all<{ k: string }>()
    ).results.map((r) => r.k);
    let missing = 0;
    for (const key of keys)
      if (!(await remote.env.MEDIA_BUCKET.head(key))) missing++;
    objects = { referenced: keys.length, missing };
  } finally {
    await remote.dispose();
  }
  // Schema for every table first, then rows: an export interleaves each
  // table's schema and data, so children would load before their parents.
  const exportFile = join(directory, "staging.sql");
  const exported = async (flag: "--no-data" | "--no-schema") => {
    const file = join(directory, `${flag.slice(5)}.sql`);
    wrangler([
      "d1",
      "export",
      "DB",
      "--remote",
      "--env",
      "staging",
      "--config",
      "wrangler.jsonc",
      "--output",
      file,
      "--skip-confirmation",
      flag,
      ...tables.flatMap((t) => ["--table", t]),
    ]);
    return readFile(file, "utf8");
  };
  await writeFile(
    exportFile,
    `${await exported("--no-data")}\nPRAGMA defer_foreign_keys = on;\n${await exported("--no-schema")}`,
  );
  const scratchConfig = join(directory, "scratch.json");
  await writeFile(
    scratchConfig,
    JSON.stringify({
      name: "veganalts-restore-drill",
      compatibility_date: source.compatibility_date,
      d1_databases: [
        {
          binding: "DB",
          database_name: "restore-drill",
          database_id: "restore-drill",
        },
      ],
    }),
  );
  const persist = join(directory, "state");
  wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    persist,
    "--config",
    scratchConfig,
    "--file",
    exportFile,
    "--yes",
  ]);
  const scratch = await getPlatformProxy<{ DB: D1Database }>({
    configPath: scratchConfig,
    // Wrangler's --persist-to directory holds the v3 state the proxy reads.
    persist: { path: join(persist, "v3") },
  });
  const mismatched: string[] = [];
  let searchDocuments = 0;
  try {
    for (const table of tables) {
      const restored = (await scratch.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM "${table}"`,
      ).first<number>("n"))!;
      if (restored !== remoteCounts[table]) mismatched.push(table);
    }
    // Derived search documents are rebuilt from the restored canonical rows.
    await scratch.env.DB.exec(
      "CREATE VIRTUAL TABLE search_index USING fts5(entity_type UNINDEXED, entity_id UNINDEXED, country_code UNINDEXED, title, subtitle, aliases, body, tokenize = 'unicode61 remove_diacritics 2')",
    );
    await scratch.env.DB.batch(
      SEARCH_INDEX_STATEMENTS.map((sql) => scratch.env.DB.prepare(sql)),
    );
    searchDocuments = (await scratch.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM search_index",
    ).first<number>("n"))!;
  } finally {
    await scratch.dispose();
  }
  const evidence = {
    at: new Date().toISOString(),
    tables: tables.length,
    rows: Object.values(remoteCounts).reduce((a, b) => a + b, 0),
    mismatched,
    searchDocuments,
    r2: objects,
  };
  await mkdir("test-results/milestone-4", { recursive: true });
  await writeFile(
    "test-results/milestone-4/backup-drill.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
  assert.deepEqual(mismatched, [], "restored row counts differ");
  assert.equal(objects.missing, 0, "referenced R2 objects are missing");
} finally {
  await rm(directory, { recursive: true, force: true });
}
