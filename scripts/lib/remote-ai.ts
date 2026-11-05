import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";

export interface RemoteAi {
  run(model: string, input: unknown): Promise<unknown>;
}

/**
 * Runs `work` with the real, billed Workers AI binding. Only the AI binding is
 * remote; nothing touches D1 or R2.
 */
export async function withRemoteAi<T>(work: (ai: RemoteAi) => Promise<T>) {
  const source = parse(await readFile("wrangler.jsonc", "utf8"));
  const directory = await mkdtemp(join(tmpdir(), "veganalts-calibration-"));
  try {
    const configPath = join(directory, "wrangler.json");
    await writeFile(
      configPath,
      JSON.stringify({
        name: "veganalts-calibration",
        account_id: source.account_id,
        compatibility_date: source.compatibility_date,
        ai: { binding: "AI", remote: true },
      }),
    );
    const proxy = await getPlatformProxy<{ AI: RemoteAi }>({
      configPath,
      remoteBindings: true,
    });
    try {
      return await work(proxy.env.AI);
    } finally {
      await proxy.dispose();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
