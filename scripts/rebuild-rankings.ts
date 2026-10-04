import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { v7 as uuid } from "uuid";
import { RatingsService } from "../server/ratings/application/service";
import { D1RatingsRepository } from "../server/ratings/infrastructure/d1-repository";
import { validateRankingParameters } from "../server/ranking/domain/policy";

const environment = process.argv[2];
if (!["local", "staging", "production"].includes(environment ?? ""))
  throw new Error("Choose local, staging, or production explicitly.");
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const target = environment === "local" ? source : source.env[environment!];
const directory = await mkdtemp(join(tmpdir(), "veganalts-rebuild-"));
try {
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: `veganalts-rebuild-${environment}`,
      account_id: source.account_id,
      compatibility_date: source.compatibility_date,
      d1_databases: target.d1_databases.map(
        (database: Record<string, unknown>) => ({
          ...database,
          remote: environment !== "local",
        }),
      ),
    }),
  );
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath,
    remoteBindings: environment !== "local",
    persist: { path: resolve(".wrangler/state/v3") },
  });
  try {
    const service = new RatingsService(
      new D1RatingsRepository(proxy.env.DB),
      validateRankingParameters({
        priorMean: Number(target.vars.RANKING_PRIOR_MEAN),
        priorStrength: Number(target.vars.RANKING_PRIOR_STRENGTH),
      }),
      uuid,
    );
    let cursor: string | null = null;
    let rebuilt = 0;
    do {
      const page = await service.rebuildPage(cursor);
      rebuilt += page.rebuilt;
      cursor = page.next;
    } while (cursor);
    console.log(JSON.stringify({ environment, rebuilt }));
  } finally {
    await proxy.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
