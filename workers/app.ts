import { createRequestHandler } from "react-router";
import {
  canonicalRedirect,
  responsePolicy,
} from "../server/shared/http/response-policy";
import { errorResponse } from "../server/shared/http/security";
import { ApplicationError } from "../server/shared/domain/errors";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(incoming, env, context) {
    const requestId = crypto.randomUUID();
    const headers = new Headers(incoming.headers);
    headers.set("X-Request-ID", requestId);
    const request = new Request(incoming, { headers });
    const url = new URL(request.url);
    const startedAt = performance.now();
    let response: Response;
    let landingCacheHit: boolean | undefined;
    try {
      const redirect = canonicalRedirect(request, env.APP_ENV);
      if (redirect) response = redirect;
      else if (url.pathname === "/healthz")
        response = Response.json(
          { status: "ok" },
          { headers: { "Cache-Control": "no-store" } },
        );
      else if (
        url.pathname.startsWith("/assets/") ||
        ["/favicon.svg", "/social.png", "/social.svg", "/robots.txt"].includes(
          url.pathname,
        )
      )
        response = await env.ASSETS.fetch(request);
      else {
        if (
          url.pathname.startsWith("/api/auth/") ||
          (url.pathname === "/sign-in" && request.method === "POST")
        ) {
          const key = request.headers.get("CF-Connecting-IP") ?? "local";
          if (!(await env.AUTH_RATE_LIMIT.limit({ key })).success)
            throw new ApplicationError(
              "RATE_LIMITED",
              "Please wait a minute before trying again.",
              429,
            );
        }
        if (
          url.pathname === "/" &&
          request.method === "GET" &&
          env.APP_ENV !== "local"
        ) {
          const key = new Request(
            `${url.origin}/__landing_cache/${env.VERSION_METADATA.id}`,
          );
          const cache = await caches.open("veganalts-public");
          const cached = await cache.match(key);
          landingCacheHit = Boolean(cached);
          response = cached ?? (await requestHandler(request));
          if (
            !cached &&
            response.status === 200 &&
            !response.headers.has("Set-Cookie")
          ) {
            context.waitUntil(
              cache
                .put(key, response.clone())
                .catch(() =>
                  console.error(
                    JSON.stringify({ event: "cache_write_failed", requestId }),
                  ),
                ),
            );
          }
        } else response = await requestHandler(request);
      }
    } catch (error) {
      if (!(error instanceof ApplicationError))
        console.error(JSON.stringify({ event: "request_failed", requestId }));
      response = errorResponse(error, requestId);
    }
    response = responsePolicy(response, request, env.APP_ENV, requestId);
    if (landingCacheHit !== undefined) {
      response.headers.set(
        "Server-Timing",
        `landing_cache;desc="${landingCacheHit ? "HIT" : "MISS"}"`,
      );
    }
    console.log(
      JSON.stringify({
        event: "request",
        requestId,
        route:
          url.pathname === "/"
            ? "home"
            : url.pathname === "/healthz"
              ? "health"
              : "application",
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
    return response;
  },
  async scheduled(_controller, env) {
    const { mediaRecoveryService } =
      await import("../server/media/infrastructure/composition");
    try {
      console.log(
        JSON.stringify({
          event: "media_recovery",
          ...(await mediaRecoveryService(env).recover()),
        }),
      );
    } catch {
      console.error(JSON.stringify({ event: "media_recovery_failed" }));
      throw new Error("Media recovery failed.");
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
