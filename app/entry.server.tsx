import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToReadableStream } from "react-dom/server";
import { NonceContext } from "./lib/nonce";
import { failureKind, routeLabel } from "@server/observability/events";

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
) {
  const nonce =
    request.headers.get("X-Render-Nonce") ??
    crypto.randomUUID().replaceAll("-", "");
  headers.set("X-Template-Nonce", nonce);
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const body = await renderToReadableStream(
    <NonceContext.Provider value={nonce}>
      <ServerRouter context={context} url={request.url} nonce={nonce} />
    </NonceContext.Provider>,
    {
      signal: AbortSignal.timeout(streamTimeout),
      nonce,
      onError() {
        status = 500;
        console.error(
          JSON.stringify({
            event: "render_failed",
            requestId: request.headers.get("X-Request-ID"),
          }),
        );
      },
    },
  );
  // Complete a cacheable document template; the gateway rotates its nonce at
  // delivery. Public content stays useful before route modules hydrate.
  await body.allReady;
  return new Response(body, { status, headers });
}

export function handleError(error: unknown, { request }: { request: Request }) {
  if (!request.signal.aborted)
    console.error(
      JSON.stringify({
        event: "route_failed",
        requestId: request.headers.get("X-Request-ID"),
        route: routeLabel(new URL(request.url).pathname),
        dependency: failureKind(error),
      }),
    );
}
