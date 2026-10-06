import { redirect } from "react-router";
import { requireUser } from "../application/session";
import { BetterAuthSessionReader } from "../infrastructure/session-reader";
import { ApplicationError } from "../../shared/domain/errors";
import { safeReturnDestination } from "../domain/return-destination";

export async function requirePageUser(request: Request, env: Cloudflare.Env) {
  try {
    return await requireUser(request, new BetterAuthSessionReader(env));
  } catch (error) {
    if (error instanceof ApplicationError && error.status === 401)
      throw redirect(
        `/sign-in?returnTo=${encodeURIComponent(safeReturnDestination(request.url, env.APP_URL))}`,
      );
    if (error instanceof ApplicationError)
      throw new Response(error.message, { status: error.status });
    throw error;
  }
}
