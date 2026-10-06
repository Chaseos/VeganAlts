import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";

export async function withCatalogPlatform<T>(
  environment: "local" | "staging",
  work: (
    env: Pick<Cloudflare.Env, "DB" | "MEDIA_BUCKET" | "IMAGES">,
  ) => Promise<T>,
) {
  const source = parse(await readFile("wrangler.jsonc", "utf8"));
  const target = environment === "local" ? source : source.env.staging;
  const directory = await mkdtemp(join(tmpdir(), "veganalts-catalog-"));
  try {
    const configPath = join(directory, "wrangler.json");
    const remote = environment === "staging";
    await writeFile(
      configPath,
      JSON.stringify({
        name: `veganalts-catalog-${environment}`,
        account_id: source.account_id,
        compatibility_date: source.compatibility_date,
        d1_databases: target.d1_databases.map(
          (binding: Record<string, unknown>) => ({ ...binding, remote }),
        ),
        r2_buckets: target.r2_buckets.map(
          (binding: Record<string, unknown>) => ({ ...binding, remote }),
        ),
        images: { binding: "IMAGES", remote },
      }),
    );
    const proxy = await getPlatformProxy<
      Pick<Cloudflare.Env, "DB" | "MEDIA_BUCKET" | "IMAGES">
    >({
      configPath,
      remoteBindings: remote,
      persist: { path: resolve(".wrangler/state/v3") },
    });
    try {
      return await work(proxy.env);
    } finally {
      await proxy.dispose();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
