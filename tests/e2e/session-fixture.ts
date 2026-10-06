import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { getAuth } from "../../server/auth/infrastructure/auth";
import { ratingsService } from "../../server/ratings/infrastructure/composition";

// A test-harness provider boundary, never imported by the application. Sessions,
// cookies, account checks, private reads and all rating writes remain real.
export async function createBrowserSession() {
  if (process.env.TEST_BASE_URL)
    throw new Error(
      "Provider simulation is restricted to the local browser harness.",
    );
  const proxy = await getPlatformProxy<Cloudflare.Env>({
    configPath: "wrangler.jsonc",
    persist: { path: resolve(".wrangler/state/v3") },
  });
  const env = proxy.env;
  const context = await (await getAuth(env)).$context;
  const user = await context.internalAdapter.createUser(
    {
      name: "Private provider name",
      email: `${crypto.randomUUID()}@e2e.invalid`,
      emailVerified: true,
    },
    { method: "oauth", oauth: { providerId: "google" } },
  );
  const session = await context.internalAdapter.createSession(user.id);
  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET!)
    .update(session.token)
    .digest("base64");
  await proxy.dispose();
  return {
    cookie: {
      name: context.authCookies.sessionToken.name,
      value: encodeURIComponent(`${session.token}.${signature}`),
      url: "http://127.0.0.1:5173",
      httpOnly: true,
      sameSite: "Lax" as const,
    },
    async dispose() {
      const cleanup = await getPlatformProxy<Cloudflare.Env>({
        configPath: "wrangler.jsonc",
        persist: { path: resolve(".wrangler/state/v3") },
      });
      try {
        await cleanup.env.DB.prepare(
          "DELETE FROM user WHERE id=? AND email LIKE '%@e2e.invalid'",
        )
          .bind(user.id)
          .run();
        let cursor: string | null = null;
        do {
          cursor = (await ratingsService(cleanup.env).rebuildPage(cursor)).next;
        } while (cursor);
      } finally {
        await cleanup.dispose();
      }
    },
  };
}
