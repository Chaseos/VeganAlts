import { env } from "cloudflare:workers";
import { getAuth } from "@server/auth/infrastructure/auth";
import { errorResponse } from "@server/shared/http/security";
import type { Route } from "./+types/auth-api";

async function handle(request: Request) {
  try {
    return await (await getAuth(env)).handler(request);
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
