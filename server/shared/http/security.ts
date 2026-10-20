import { ApplicationError } from "../domain/errors";
import { failureKind } from "../../observability/events";

export function requireSameOrigin(request: Request, origin: string) {
  if (request.headers.get("Origin") !== new URL(origin).origin) {
    throw new ApplicationError(
      "INVALID_ORIGIN",
      "Refresh this page before making changes.",
      403,
    );
  }
}

export function errorResponse(
  error: unknown,
  requestId: string,
  document = false,
) {
  const known = error instanceof ApplicationError;
  console.error(
    JSON.stringify({
      event: "request_error",
      requestId,
      code: known ? error.code : "INTERNAL_ERROR",
      status: known ? error.status : 500,
      dependency: failureKind(error),
    }),
  );
  if (document) {
    const status = known ? error.status : 500;
    const escape = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    const title =
      status === 429
        ? "Please wait a moment"
        : status === 404
          ? "This page isn’t here"
          : "This page couldn’t load";
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · VeganAlts</title></head><body><main id="main"><p>VeganAlts · Error ${status}</p><h1>${title}</h1><p>${status === 429 ? "Please wait a minute before trying again." : known ? escape(error.message) : "Please try again in a moment."}</p>${status === 429 || status >= 500 ? '<p><a href="">Retry this page</a></p>' : ""}<p><a href="/">Back to VeganAlts</a></p></main></body></html>`,
      {
        status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "private, no-store",
        },
      },
    );
  }
  return Response.json(
    {
      type: "about:blank",
      title: known ? error.message : "Unexpected error",
      status: known ? error.status : 500,
      code: known ? error.code : "INTERNAL_ERROR",
      requestId,
    },
    {
      status: known ? error.status : 500,
      headers: {
        "Content-Type": "application/problem+json",
        "Cache-Control": "private, no-store",
      },
    },
  );
}
