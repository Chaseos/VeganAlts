import { redirect } from "react-router";
import { ApplicationError } from "../../shared/domain/errors";
import { communityActor } from "./handlers";
import { safeReturnDestination } from "../../auth/domain/return-destination";

export async function communityPageActor(
  request: Request,
  env: Cloudflare.Env,
  admin = false,
) {
  try {
    return await communityActor(request, env, admin);
  } catch (error) {
    if (error instanceof ApplicationError) {
      if (error.status === 401) {
        throw redirect(
          `/sign-in?returnTo=${encodeURIComponent(safeReturnDestination(request.url, env.APP_URL))}`,
        );
      }
      throw new Response(error.message, {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    throw error;
  }
}
