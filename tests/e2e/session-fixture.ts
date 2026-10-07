import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { getAuth } from "../../server/auth/infrastructure/auth";
import { ratingsService } from "../../server/ratings/infrastructure/composition";
import { readFile, writeFile } from "node:fs/promises";

// A test-harness provider boundary, never imported by the application. Sessions,
// cookies, account checks, private reads and all rating writes remain real.
export async function createBrowserSession(
  options: { administrator?: boolean } = {},
) {
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
  const operator = options.administrator
    ? await env.DB.prepare(
        "SELECT id FROM user WHERE email='operator@e2e.invalid'",
      ).first<{ id: string }>()
    : null;
  if (
    options.administrator &&
    (!operator || !env.ADMIN_USER_IDS.split(",").includes(operator.id))
  )
    throw new Error(
      "Run the local browser preparation to configure the test operator allowlist.",
    );
  const user =
    operator ??
    (await context.internalAdapter.createUser(
      {
        name: "Private provider name",
        email: `${crypto.randomUUID()}@e2e.invalid`,
        emailVerified: true,
      },
      { method: "oauth", oauth: { providerId: "google" } },
    ));
  const session = await context.internalAdapter.createSession(user.id);
  const signature = createHmac("sha256", env.BETTER_AUTH_SECRET!)
    .update(session.token)
    .digest("base64");
  await proxy.dispose();
  return {
    userId: user.id,
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
        const retained =
          options.administrator ||
          (await cleanup.env.DB.prepare(
            "SELECT user_id FROM contribution_receipts WHERE user_id=? UNION SELECT user_id FROM submission_receipts WHERE user_id=? LIMIT 1",
          )
            .bind(user.id, user.id)
            .first());
        if (retained) {
          await cleanup.env.DB.prepare("DELETE FROM session WHERE user_id=?")
            .bind(user.id)
            .run();
          if (!options.administrator)
            await cleanup.env.DB.prepare(
              "UPDATE profiles SET account_state='restricted' WHERE user_id=?",
            )
              .bind(user.id)
              .run();
        } else
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

export async function ensureBrowserOperator() {
  if (process.env.TEST_BASE_URL)
    throw new Error("The operator fixture is local only.");
  const proxy = await getPlatformProxy<Cloudflare.Env>({
    configPath: "wrangler.jsonc",
    persist: { path: resolve(".wrangler/state/v3") },
  });
  try {
    const context = await (await getAuth(proxy.env)).$context;
    const existing = await proxy.env.DB.prepare(
      "SELECT id FROM user WHERE email='operator@e2e.invalid'",
    ).first<{ id: string }>();
    const user =
      existing ??
      (await context.internalAdapter.createUser(
        {
          name: "Local test operator",
          email: "operator@e2e.invalid",
          emailVerified: true,
        },
        { method: "oauth", oauth: { providerId: "google" } },
      ));
    const current = await readFile(".dev.vars", "utf8"),
      match = current.match(/^ADMIN_USER_IDS=(.*)$/m);
    const ids = new Set(
      (match?.[1] ?? "")
        .replace(/^['"]|['"]$/g, "")
        .split(",")
        .filter(Boolean),
    );
    ids.add(user.id);
    const line = `ADMIN_USER_IDS=${[...ids].join(",")}`;
    await writeFile(
      ".dev.vars",
      match
        ? current.replace(/^ADMIN_USER_IDS=.*$/m, line)
        : `${current.trimEnd()}\n${line}\n`,
      { mode: 0o600 },
    );
  } finally {
    await proxy.dispose();
  }
}
