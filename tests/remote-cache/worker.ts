import { WorkerEntrypoint } from "cloudflare:workers";
import {
  cachePublicResponse,
  invalidationTags,
  normalizedPublicRequest,
  publicRoute,
} from "../../server/shared/http/public-cache";
import { deliverDocument } from "../../server/shared/http/document-delivery";

// Deployed only by the explicit, disposable native-cache verification script.
// No application database, authentication, media or production bindings exist.
export class Fixture extends WorkerEntrypoint {
  async fetch(request: Request) {
    if (request.headers.get("X-Fixture-Mode") === "failure")
      return new Response("Simulated dependency outage", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const route = publicRoute(new URL(request.url))!;
    const ttl = route.slug === "purge" ? 600 : 5;
    const response = cachePublicResponse(
      new Response(
        `<html><body>${request.headers.get("X-Fixture-Revision")} ${crypto.randomUUID()}<script nonce="template"></script></body></html>`,
        {
          headers: {
            "Content-Type": "text/html",
            "X-Template-Nonce": "template",
            ...(request.headers.get("X-Fixture-Mode") === "cookie"
              ? { "Set-Cookie": "fixture=value; Secure; HttpOnly" }
              : {}),
          },
        },
      ),
      { ...route, ttl },
    );
    if (!response.headers.has("Set-Cookie")) {
      // Exercise the production directive semantics with bounded test windows.
      response.headers.set(
        "Cloudflare-CDN-Cache-Control",
        `public, max-age=${ttl}, stale-while-revalidate=2, stale-if-error=6`,
      );
    }
    return response;
  }
  async purge(slug: string) {
    if (!this.ctx.cache) throw new Error("Native cache missing");
    return this.ctx.cache.purge({
      tags: invalidationTags({ kind: "category", slug }),
    });
  }
}

export default {
  async fetch(request: Request, _env: unknown, context: ExecutionContext) {
    // The repository's generated Cloudflare.Exports describes the application
    // Worker; this independent fixture has its own entrypoint contract.
    const fixture = (
      context.exports as unknown as {
        Fixture: Fetcher & { purge(slug: string): Promise<unknown> };
      }
    ).Fixture;
    const url = new URL(request.url);
    if (request.method === "POST")
      return Response.json(
        await fixture.purge(url.pathname.split("/").at(-1)!),
      );
    const normalized = normalizedPublicRequest(request, url.origin, "fixture");
    normalized.headers.set(
      "X-Fixture-Mode",
      url.searchParams.get("mode") ?? "normal",
    );
    normalized.headers.set(
      "X-Fixture-Revision",
      url.searchParams.get("revision") === "two" ? "two" : "one",
    );
    const response = await fixture.fetch(normalized);
    const output = deliverDocument(response, crypto.randomUUID(), "");
    output.headers.set(
      "X-Public-Cache",
      response.headers.get("CF-Cache-Status") ?? "UNKNOWN",
    );
    return output;
  },
};
