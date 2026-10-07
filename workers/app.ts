import { WorkerEntrypoint } from "cloudflare:workers";
import { createRequestHandler } from "react-router";
import {
  canonicalRedirect,
  conditionalMediaResponse,
  responsePolicy,
} from "../server/shared/http/response-policy";
import { errorResponse } from "../server/shared/http/security";
import { ApplicationError } from "../server/shared/domain/errors";
import {
  cachePublicResponse,
  invalidationTags,
  normalizedPublicRequest,
  publicRoute,
  type MaterialCatalogChange,
} from "../server/shared/http/public-cache";
import { deliverDocument } from "../server/shared/http/document-delivery";
import { clientKey, enforceLimit } from "../server/abuse/service";
import {
  failureKind,
  recordEvent,
  routeLabel,
} from "../server/observability/events";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

// Only the gateway dispatches public reads here. Native Workers Cache performs
// collapse/revalidation at this entrypoint; private handlers are never reachable.
export class PublicCatalog extends WorkerEntrypoint<Cloudflare.Env> {
  async fetch(incoming: Request): Promise<Response> {
    const route = publicRoute(new URL(incoming.url));
    if (
      !route ||
      incoming.method !== "GET" ||
      incoming.headers.has("Cookie") ||
      incoming.headers.has("Authorization")
    )
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    const headers = new Headers(incoming.headers);
    headers.set("X-Render-Nonce", crypto.randomUUID().replaceAll("-", ""));
    const renderUrl = new URL(incoming.url);
    for (const key of ["__country", "__representation", "__deployment"])
      renderUrl.searchParams.delete(key);
    const request = new Request(renderUrl, { headers });
    try {
      return cachePublicResponse(await requestHandler(request), route);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "public_render_failed",
          route: route.kind,
          dependency: failureKind(error),
          requestId: headers.get("X-Request-ID"),
        }),
      );
      return errorResponse(
        error,
        headers.get("X-Request-ID") ?? crypto.randomUUID(),
      );
    }
  }
  // Internal RPC only. Material edits invoke this after persistence succeeds;
  // there is deliberately no maintenance HTTP route and ratings never call it.
  async invalidate(change: MaterialCatalogChange) {
    if (!this.ctx.cache)
      throw new Error(
        "Native Workers Cache is unavailable in this environment.",
      );
    const result = await this.ctx.cache.purge({
      tags: invalidationTags(change),
    });
    if (!result.success) throw new Error("Catalog cache invalidation failed.");
    return { success: true };
  }
}

export default {
  async fetch(incoming, env, context) {
    const requestId = crypto.randomUUID();
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const headers = new Headers(incoming.headers);
    headers.set("X-Request-ID", requestId);
    headers.set("X-Render-Nonce", nonce);
    const request = new Request(incoming, { headers });
    const url = new URL(request.url);
    const route = publicRoute(url);
    const startedAt = performance.now();
    let response: Response;
    let cacheOutcome = "BYPASS";
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
        ) ||
        (import.meta.env.DEV &&
          /^\/(?:@vite\/|@react-router\/|@react-refresh|@id\/|@fs\/|node_modules\/|app\/|server\/)/.test(
            url.pathname,
          ))
      )
        response = await env.ASSETS.fetch(request);
      else {
        if (url.pathname.startsWith("/api/auth/"))
          await enforceLimit(env.AUTH_RATE_LIMIT, `ip:${clientKey(request)}`);
        if (route && ["GET", "HEAD"].includes(request.method)) {
          if (
            env.APP_ENV === "production" &&
            route.kind !== "media" &&
            !["/", "/_root.data"].includes(url.pathname)
          )
            throw new ApplicationError(
              "NOT_FOUND",
              "This page is not available.",
              404,
            );
          if (route.kind === "search")
            await enforceLimit(env.SEARCH_RATE_LIMIT, clientKey(request));
          const duplicate =
            route.kind === "product" && route.slug
              ? await (
                  await import("../server/community/infrastructure/public-read")
                ).readCanonicalRedirect(env.DB, route.slug)
              : null;
          response = duplicate
            ? await requestHandler(request)
            : await context.exports.PublicCatalog.fetch(
                normalizedPublicRequest(
                  request,
                  env.APP_URL,
                  env.VERSION_METADATA.id,
                ),
              );
          cacheOutcome = duplicate
            ? "BYPASS"
            : (response.headers.get("CF-Cache-Status") ??
              (env.APP_ENV === "local" ? "LOCAL" : "UNKNOWN"));
          if (
            response.ok &&
            request.method === "GET" &&
            route.representation === "document"
          )
            recordEvent(env, "page_view", route.kind, cacheOutcome);
          if (
            response.ok &&
            request.method === "GET" &&
            route.kind === "search" &&
            url.searchParams.get("q")
          )
            recordEvent(env, "search", "search", route.representation);
        } else response = await requestHandler(request);
      }
    } catch (error) {
      if (!(error instanceof ApplicationError))
        console.error(
          JSON.stringify({
            event: "request_failed",
            requestId,
            dependency: failureKind(error),
          }),
        );
      response = errorResponse(error, requestId);
    }
    if (route?.kind === "media")
      response = conditionalMediaResponse(response, request);
    response = deliverDocument(
      response,
      nonce,
      route?.representation === "document" && response.ok
        ? env.WEB_ANALYTICS_TOKEN
        : "",
    );
    response = responsePolicy(response, request, env.APP_ENV, requestId, nonce);
    response.headers.set(
      "Server-Timing",
      `app;dur=${Math.round(performance.now() - startedAt)}, public_cache;desc="${cacheOutcome.replace(/[^A-Z_]/g, "")}"`,
    );
    if (route) response.headers.set("X-Public-Cache", cacheOutcome);
    if (response.status === 429) response.headers.set("Retry-After", "60");
    if (request.method === "HEAD") response = new Response(null, response);
    console.log(
      JSON.stringify({
        event: "request",
        requestId,
        route: routeLabel(url.pathname),
        status: response.status,
        cache: cacheOutcome,
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
      const { recoverCommunity } =
        await import("../server/community/infrastructure/recovery");
      await recoverCommunity(env.DB, env.MEDIA_BUCKET, Date.now());
    } catch {
      console.error(JSON.stringify({ event: "media_recovery_failed" }));
      throw new Error("Media recovery failed.");
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
