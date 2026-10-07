import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { prepareLegacyReports } from "../db/upgrades/legacy-reports";

const environment = process.argv[2];
if (!["local", "staging", "production"].includes(environment ?? ""))
  throw new Error("Choose local, staging, or production explicitly.");
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const target = environment === "local" ? source : source.env[environment!];
const remote = environment !== "local";
const directory = await mkdtemp(join(tmpdir(), "veganalts-migrate-"));
try {
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: `veganalts-migrate-${environment}`,
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
    console.log(
      JSON.stringify({
        environment,
        legacyReports: await prepareLegacyReports(proxy.env.DB),
      }),
    );
  } finally {
    await proxy.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
// Close the preflight connection before Wrangler obtains its migration lock.
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--config",
    "wrangler.jsonc",
    ...(remote ? ["--remote", "--env", environment!] : ["--local", "--env="]),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
