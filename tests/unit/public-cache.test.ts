import { expect, it } from "vitest";
import {
  cachePublicResponse,
  edgeCacheControl,
  invalidationTags,
  normalizedPublicRequest,
  publicRoute,
} from "../../server/shared/http/public-cache";

const origin = "https://staging.veganalts.com";
it("normalizes public identities without session state and separates representations/deployments", () => {
  const input = new Request(
    `${origin}/us/search?q=beef&utm_source=irrelevant`,
    {
      headers: {
        Cookie: "secret",
        Authorization: "Bearer secret",
        Origin: "https://other.test",
        "X-Render-Nonce": "untrusted",
      },
    },
  );
  const normalized = normalizedPublicRequest(input, origin, "v1");
  for (const header of ["Cookie", "Authorization", "Origin", "X-Render-Nonce"])
    expect(normalized.headers.has(header)).toBe(false);
  expect(normalized.url).not.toContain("utm_source");
  expect(normalized.url).toContain("__country=US");
  expect(normalized.url).toContain("__deployment=v1");
  const data = normalizedPublicRequest(
    new Request(`${origin}/us/search.data?q=beef&_routes=routes/search,root`),
    origin,
    "v1",
  );
  expect(data.url).not.toBe(normalized.url);
  expect(data.url).toContain("__representation=data");
  expect(normalizedPublicRequest(input, origin, "v2").url).not.toBe(
    normalized.url,
  );
  expect(() =>
    normalizedPublicRequest(
      new Request(`${origin}/us/search?q=one&q=two`),
      origin,
      "v1",
    ),
  ).toThrow();
  expect(() =>
    normalizedPublicRequest(
      new Request(`${origin}/api/v1/me/ratings`),
      origin,
      "v1",
    ),
  ).toThrow();
  expect(() =>
    normalizedPublicRequest(
      new Request(`${origin}/us/search?country=CA`),
      origin,
      "v1",
    ),
  ).toThrow();
});

it("uses native stale semantics with bounded stale errors and separate browser directives", () => {
  for (const [path, ttl] of [
    ["/", 1800],
    ["/us/milk", 600],
    ["/us/products/oatly-original", 900],
    ["/users/example", 600],
  ] as const) {
    const route = publicRoute(new URL(path, origin))!;
    expect(route.ttl).toBe(ttl);
    const response = cachePublicResponse(new Response("public"), route);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0");
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBe(
      edgeCacheControl(ttl),
    );
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).not.toMatch(
      /s-maxage|must-revalidate|proxy-revalidate/,
    );
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toContain(
      "stale-if-error=86400",
    );
  }
  const route = publicRoute(new URL("/us/milk", origin))!;
  for (const response of [
    new Response("failure", { status: 500 }),
    new Response(null, { status: 302, headers: { Location: "/sign-in" } }),
    new Response("private", { headers: { "Set-Cookie": "secret" } }),
    new Response("personal", {
      headers: { "Cache-Control": "private, no-store" },
    }),
  ]) {
    expect(
      cachePublicResponse(response, route).headers.get(
        "Cloudflare-CDN-Cache-Control",
      ),
    ).toBe("no-store");
  }
});

it("invalidates all affected material representations without a rating invalidation path", () => {
  expect(
    invalidationTags({
      kind: "product",
      slug: "example",
      categorySlugs: ["milk", "butter"],
    }),
  ).toEqual([
    "product:example",
    "surface:home",
    "surface:search",
    "category:milk",
    "category:butter",
  ]);
  expect(invalidationTags({ kind: "profile", slug: "example" })).toEqual([
    "profile:example",
  ]);
  expect(invalidationTags({ kind: "category", slug: "milk" })).toContain(
    "surface:product",
  );
  expect(() =>
    invalidationTags({ kind: "product", slug: "bad,tag" }),
  ).toThrow();
});

it("shares only validated immutable image variants and preserves their browser lifetime", () => {
  for (const variant of ["full", "thumbnail", "evidence"]) {
    const request = new Request(
      `${origin}/media/image_1/${variant}?irrelevant=1`,
      {
        headers: { Cookie: "private", "If-None-Match": '"visitor-etag"' },
      },
    );
    const route = publicRoute(new URL(request.url))!;
    expect(route).toMatchObject({
      kind: "media",
      representation: "image",
      ttl: 86400,
    });
    const normalized = normalizedPublicRequest(request, origin, "v1");
    expect(normalized.headers.has("Cookie")).toBe(false);
    expect(normalized.headers.has("If-None-Match")).toBe(false);
    expect(normalized.url).not.toContain("irrelevant");
    const response = cachePublicResponse(
      new Response("bytes", { headers: { ETag: '"image-etag"' } }),
      route,
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("Cloudflare-CDN-Cache-Control")).toBe(
      edgeCacheControl(86400),
    );
    expect(
      cachePublicResponse(
        new Response("Not found", { status: 404 }),
        route,
      ).headers.get("Cloudflare-CDN-Cache-Control"),
    ).toBe("no-store");
  }
  expect(publicRoute(new URL(`${origin}/media/image_1/original`))).toBeNull();
  expect(publicRoute(new URL(`${origin}/media/image_1/full.data`))).toBeNull();
});
