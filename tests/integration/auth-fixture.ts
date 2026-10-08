import { env } from "cloudflare:workers";
import { getAuth } from "../../server/auth/infrastructure/auth";

// The only simulated boundary is the provider exchange; application HTTP
// handlers still validate a real Better Auth session against the test D1.
export async function authenticatedFixture() {
  const pass = { limit: async () => ({ success: true }) };
  const events: AnalyticsEngineDataPoint[] = [];
  const authEnv: Cloudflare.Env = {
    ...env,
    APP_ENV: "local",
    APP_URL: "http://127.0.0.1:5173",
    ADMIN_USER_IDS: "",
    RANKING_PRIOR_MEAN: "3.5",
    RANKING_PRIOR_STRENGTH: "10",
    TURNSTILE_SITE_KEY: "",
    WEB_ANALYTICS_TOKEN: "",
    BETTER_AUTH_SECRET: "isolated-tests-only-012345678901234567890123456789",
    AUTH_RATE_LIMIT: pass,
    RATING_RATE_LIMIT: pass,
    RATING_RISK_LIMIT: pass,
    AUTH_RISK_LIMIT: pass,
    COMMENT_RATE_LIMIT: pass,
    VOTE_RATE_LIMIT: pass,
    APP_EVENTS: {
      writeDataPoint: (point) => {
        if (point) events.push(point);
      },
    },
  };
  const auth = await getAuth(authEnv);
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    {
      name: "Private test name",
      email: `${crypto.randomUUID()}@example.invalid`,
      emailVerified: true,
    },
    { method: "oauth", oauth: { providerId: "google" } },
  );
  const session = await context.internalAdapter.createSession(user.id);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authEnv.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(session.token),
  );
  const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`)}`;
  return {
    auth,
    authEnv,
    user,
    session,
    events,
    headers: new Headers({
      Cookie: cookie,
      Origin: authEnv.APP_URL,
      "Content-Type": "application/json",
    }),
  };
}
