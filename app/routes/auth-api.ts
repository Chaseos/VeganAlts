import { env } from "cloudflare:workers";
import { getAuth } from "@server/auth/infrastructure/auth";
import { errorResponse } from "@server/shared/http/security";
import type { Route } from "./+types/auth-api";
import { protectContribution } from "@server/abuse/service";
import { limitedJson } from "@server/shared/http/json";
import { recordEvent } from "@server/observability/events";
import { requireSameOrigin } from "@server/shared/http/security";

async function handle(request: Request) {
  try {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === "/api/auth/sign-in/social") {
      requireSameOrigin(request, env.APP_URL);
      const input = await limitedJson(request.clone());
      const token =
        input &&
        typeof input === "object" &&
        "challengeToken" in input &&
        typeof input.challengeToken === "string"
          ? input.challengeToken
          : undefined;
      await protectContribution(request, env, "sign-in", "anonymous", token);
    }
    const response = await (await getAuth(env)).handler(request);
    if (
      path.startsWith("/api/auth/callback/") &&
      response.headers.get("Location")?.includes("error=")
    )
      recordEvent(env, "sign_in_failed", "auth");
    return response;
  } catch (error) {
    return errorResponse(
      error,
      request.headers.get("X-Request-ID") ?? crypto.randomUUID(),
    );
  }
}
export async function loader({ request }: Route.LoaderArgs) {
  return handle(request);
}
export async function action({ request }: Route.ActionArgs) {
  return handle(request);
}
