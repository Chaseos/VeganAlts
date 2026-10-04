import { env } from "cloudflare:workers";
import { handleUpload } from "@server/media/http/upload";
import { errorResponse } from "@server/shared/http/security";
import type { Route } from "./+types/media-upload";

export function loader() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  try {
    return Response.json(await handleUpload(request, env), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(
      error,
      request.headers.get("X-Request-ID") ?? crypto.randomUUID(),
    );
  }
}
