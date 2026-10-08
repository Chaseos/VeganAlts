import { ApplicationError } from "../shared/domain/errors";

interface ChallengeConfig {
  APP_URL: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
}
interface ContributionProtectionConfig extends ChallengeConfig {
  AUTH_RATE_LIMIT: RateLimit;
  RATING_RATE_LIMIT: RateLimit;
  AUTH_RISK_LIMIT: RateLimit;
  RATING_RISK_LIMIT: RateLimit;
}

export function clientKey(request: Request) {
  return request.headers.get("CF-Connecting-IP") ?? "local";
}

export async function enforceLimit(binding: RateLimit, key: string) {
  if (!(await binding.limit({ key })).success)
    throw new ApplicationError(
      "RATE_LIMITED",
      "Please wait a minute before trying again.",
      429,
    );
}

export async function verifyChallenge(
  token: string | undefined,
  action: "sign-in" | "rating" | "community",
  request: Request,
  env: ChallengeConfig,
  verify: typeof fetch = fetch,
) {
  if (!token)
    throw new ApplicationError(
      "CHALLENGE_REQUIRED",
      "Complete the quick security check, then try again.",
      403,
    );
  if (!env.TURNSTILE_SECRET_KEY || !env.TURNSTILE_SITE_KEY)
    throw new ApplicationError(
      "CHALLENGE_UNAVAILABLE",
      "The security check is unavailable. Wait a minute and try again.",
      503,
    );
  let result: { success?: boolean; hostname?: string; action?: string };
  try {
    const response = await verify(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        signal: AbortSignal.timeout(8000),
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET_KEY,
          response: token,
          remoteip: clientKey(request),
          idempotency_key: crypto.randomUUID(),
        }),
      },
    );
    if (!response.ok) throw new Error();
    result = await response.json();
  } catch {
    throw new ApplicationError(
      "CHALLENGE_UNAVAILABLE",
      "The security check did not respond. Please retry.",
      503,
    );
  }
  if (
    !result.success ||
    result.hostname !== new URL(env.APP_URL).hostname ||
    result.action !== action
  )
    throw new ApplicationError(
      "CHALLENGE_REQUIRED",
      "The security check expired. Please complete it again.",
      403,
    );
}

export async function protectContribution(
  request: Request,
  env: ContributionProtectionConfig,
  action: "sign-in" | "rating" | "community",
  actor: string,
  token?: string,
) {
  const hard =
    action !== "sign-in" ? env.RATING_RATE_LIMIT : env.AUTH_RATE_LIMIT;
  const risk =
    action !== "sign-in" ? env.RATING_RISK_LIMIT : env.AUTH_RISK_LIMIT;
  await enforceLimit(hard, `ip:${clientKey(request)}`);
  if (action !== "sign-in") await enforceLimit(hard, `user:${actor}`);
  const elevated = !(
    await risk.limit({ key: `${actor}:${clientKey(request)}` })
  ).success;
  if (elevated || token) await verifyChallenge(token, action, request, env);
}
