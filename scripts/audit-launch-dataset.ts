import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { auditLaunchDataset } from "./launch-dataset";

// Read-only launch-dataset audit. It reports counts and record identifiers
// only (never names, emails or contribution text) so the output can be kept
// as evidence. Nothing is written to the database.
const environment = process.argv[2];
if (!["local", "staging", "production"].includes(environment ?? ""))
  throw new Error("Choose local, staging or production explicitly.");
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const target = environment === "local" ? source : source.env[environment!];
const remote = environment !== "local";

const directory = await mkdtemp(join(tmpdir(), "veganalts-audit-"));
try {
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: `veganalts-audit-${environment}`,
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
    const result = {
      environment,
      at: new Date().toISOString(),
      ...(await auditLaunchDataset(proxy.env.DB)),
    };
    await mkdir("test-results/milestone-5", { recursive: true });
    await writeFile(
      `test-results/milestone-5/launch-audit-${environment}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(
      JSON.stringify({
        environment,
        readyForLaunch: result.readyForLaunch,
        blocking: result.blocking,
        counts: Object.fromEntries(
          Object.entries(result.report).map(([k, v]) => [k, v.count]),
        ),
      }),
    );
  } finally {
    await proxy.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
