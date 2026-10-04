import { ApplicationError } from "../domain/errors";

export function requireSameOrigin(request: Request, origin: string) {
  if (request.headers.get("Origin") !== new URL(origin).origin) {
    throw new ApplicationError(
      "INVALID_ORIGIN",
      "Refresh this page before making changes.",
      403,
    );
  }
}

export function errorResponse(error: unknown, requestId: string) {
  const known = error instanceof ApplicationError;
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
