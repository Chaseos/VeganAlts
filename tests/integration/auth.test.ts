import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { getAuth } from "../../server/auth/infrastructure/auth";
import { BetterAuthSessionReader } from "../../server/auth/infrastructure/session-reader";
import {
  requireAdministrator,
  requireUser,
} from "../../server/auth/application/session";

it("keeps OAuth state for the full verification lifetime and rejects missing cookies", async () => {
  const origin = "https://staging.veganalts.com";
  const auth = await getAuth({
    ...env,
    APP_ENV: "staging",
    APP_URL: origin,
    ADMIN_USER_IDS: "",
    RANKING_PRIOR_MEAN: "3.5",
    RANKING_PRIOR_STRENGTH: "10",
    BETTER_AUTH_SECRET: "isolated-oauth-tests-012345678901234567890123456789",
    GOOGLE_CLIENT_ID: "isolated-client",
    GOOGLE_CLIENT_SECRET: "isolated-provider-secret",
  });
  const started = await auth.api.signInSocial({
    headers: new Headers({ Origin: origin }),
    body: {
      provider: "google",
      callbackURL: `${origin}/account`,
      errorCallbackURL: `${origin}/sign-in`,
    },
    asResponse: true,
  });
  const stateCookie = started.headers.getSetCookie()[0]!;
  expect(stateCookie).toContain("Max-Age=600");
  expect(stateCookie).toContain("SameSite=Lax");
  expect(stateCookie).toContain("Secure");
  expect(stateCookie).toContain("HttpOnly");
  const authorization = (await started.json()) as { url: string };
  const state = new URL(authorization.url).searchParams.get("state")!;
  const callback = `${origin}/api/auth/callback/google?state=${encodeURIComponent(state)}&error=access_denied`;
  const rejected = await auth.handler(new Request(callback));
  expect(
    new URL(rejected.headers.get("Location")!).searchParams.get("error"),
  ).toBe("state_mismatch");
  const valid = await auth.handler(
    new Request(callback, {
      headers: { Cookie: stateCookie.split(";")[0]! },
    }),
  );
  expect(
    new URL(valid.headers.get("Location")!).searchParams.get("error"),
  ).toBe("access_denied");
});

it("persists a signed session, links a profile, authorizes by user ID, and signs out", async () => {
  const authEnv: Cloudflare.Env = {
    ...env,
    APP_ENV: "local",
    APP_URL: "http://127.0.0.1:5173",
    ADMIN_USER_IDS: "",
    RANKING_PRIOR_MEAN: "3.5",
    RANKING_PRIOR_STRENGTH: "10",
    BETTER_AUTH_SECRET: "isolated-tests-only-012345678901234567890123456789",
  };
  const auth = await getAuth(authEnv);
  const context = await auth.$context;
  // Only the provider boundary is bypassed here. D1, Better Auth's session
  // signing/validation, profile hook, and sign-out endpoint are real.
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
  const headers = new Headers({ Cookie: cookie, Origin: authEnv.APP_URL });
  const request = new Request(`${authEnv.APP_URL}/account`, { headers });
  const reader = new BetterAuthSessionReader(authEnv);
  const current = await requireUser(request, reader);
  expect(current.id).toBe(user.id);
  expect(current.profile.displayName).toBeNull();
  expect(
    await requireUser(request, new BetterAuthSessionReader(authEnv)),
  ).toEqual(current);
  await expect(
    requireAdministrator(request, reader, "someone-else"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await requireAdministrator(request, reader, user.id)).id).toBe(
    user.id,
  );
  const response = await auth.handler(
    new Request(`${authEnv.APP_URL}/api/auth/sign-out`, {
      method: "POST",
      headers,
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  expect(await reader.getUser(headers)).toBeNull();
  await expect(requireUser(request, reader)).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
});
