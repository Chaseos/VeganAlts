import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";

// Local browser harness only: run statements against the dev Worker's D1 to
// arrange or remove test data (fictional stores, never real retailer claims).
export async function withLocalDb<T>(work: (db: D1Database) => Promise<T>) {
  if (process.env.TEST_BASE_URL)
    throw new Error("Local data setup is restricted to the browser harness.");
  const proxy = await getPlatformProxy<Cloudflare.Env>({
    configPath: "wrangler.jsonc",
    persist: { path: resolve(".wrangler/state/v3") },
  });
  try {
    return await work(proxy.env.DB);
  } finally {
    await proxy.dispose();
  }
}
