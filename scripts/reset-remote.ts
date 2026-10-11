import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { emptyDatabase } from "../db/empty-database";

// Empties a remote D1 database so `npm run db:migrate:<env>` recreates it from
// version 1. R2 objects are left alone. The Time Travel bookmark printed first
// is what `wrangler d1 time-travel restore` returns to within the retention
// window.
const environment = process.argv[2];
if (!["staging", "production"].includes(environment ?? ""))
  throw new Error("Choose staging or production explicitly.");
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const target = source.env[environment!];
const name: string = target.d1_databases[0].database_name;
if (!process.argv.slice(3).includes(`--confirm-reset=${name}`))
  throw new Error(
    `Pass --confirm-reset=${name} to erase every table in ${name}. Its data cannot be recovered except through Time Travel.`,
  );

const bookmark = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "time-travel",
    "info",
    name,
    "--json",
    "--config",
    "wrangler.jsonc",
    "--env",
    environment!,
  ],
  { encoding: "utf8" },
);
if (bookmark.status !== 0)
  throw new Error(
    `Could not record a Time Travel bookmark: ${bookmark.stderr}`,
  );
console.log(
  JSON.stringify({
    environment,
    database: name,
    before: bookmark.stdout.trim(),
  }),
);

const directory = await mkdtemp(join(tmpdir(), "veganalts-reset-"));
try {
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: `veganalts-reset-${environment}`,
      account_id: source.account_id,
      compatibility_date: source.compatibility_date,
      d1_databases: target.d1_databases.map(
        (database: Record<string, unknown>) => ({ ...database, remote: true }),
      ),
    }),
  );
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath,
    remoteBindings: true,
    persist: { path: resolve(".wrangler/state/v3") },
  });
  try {
    const db = proxy.env.DB;
    const dropped = await emptyDatabase(db);
    const left = await db
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
      )
      .first<number>("n");
    console.log(JSON.stringify({ environment, dropped, left }));
  } finally {
    await proxy.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
