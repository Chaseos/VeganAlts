import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToReadableStream } from "react-dom/server";

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
) {
  headers.set("Content-Type", "text/html; charset=utf-8");
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const body = await renderToReadableStream(
    <ServerRouter context={context} url={request.url} />,
    {
      signal: AbortSignal.timeout(streamTimeout),
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
  // These screens use native links and forms. Completing the document avoids
  // streaming scripts and ships no application JavaScript to the browser.
  await body.allReady;
  return new Response(body, { status, headers });
}

export function handleError(
  _error: unknown,
  { request }: { request: Request },
) {
  if (!request.signal.aborted)
    console.error(
      JSON.stringify({
        event: "route_failed",
        requestId: request.headers.get("X-Request-ID"),
      }),
    );
}
