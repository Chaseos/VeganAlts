import { env } from "cloudflare:workers";
import { redirect } from "react-router";
import { requirePageUser } from "@server/auth/http/require-page-user";
import { safeReturnDestination } from "@server/auth/domain/return-destination";
import { recordEvent } from "@server/observability/events";
import type { Route } from "./+types/auth-return";

export async function loader({ request }: Route.LoaderArgs) {
  await requirePageUser(request, env);
  recordEvent(env, "sign_in_succeeded", "auth");
  return redirect(
    safeReturnDestination(
      new URL(request.url).searchParams.get("returnTo"),
      env.APP_URL,
    ),
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
