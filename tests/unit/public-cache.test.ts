import { expect, it } from "vitest";
import {
  cachePublicResponse,
  edgeCacheControl,
  invalidationTags,
  normalizedPublicRequest,
  publicRedirect,
  publicRoute,
} from "../../server/shared/http/public-cache";

const origin = "https://staging.veganalts.com";
it("classifies router-accepted public aliases and gives them one canonical cache identity", () => {
  for (const [canonical, aliases] of [
    [
      "/us/search",
      ["/us/search/", "/US/search", "/us/se%61rch", "/%75s/search///"],
    ],
    [
      "/us/search.data",
      ["/US/search.data", "/us/search/.data", "/us/se%61rch.data"],
    ],
    ["/api/v1/search", ["/API/V1/search", "/api/v1/search/"]],
    ["/api/v1/suggest", ["/API/V1/Suggest", "/api/v1/suggest/"]],
    ["/us/ground-beef", ["/US/ground-beef/", "/us/GROUND-BEEF"]],
    [
      "/us/products/beyond-beef",
      ["/US/products/beyond-beef/", "/us/products/Beyond-Beef"],
    ],
    [
      "/users/demo_taster_01",
      ["/USERS/demo_taster_01/", "/users/DEMO_TASTER_01"],
    ],
    ["/media/Image_1/full", ["/MEDIA/Image_1/full/", "/media/Image_1/%66ull"]],
  ] as const) {
    const request = new Request(`${origin}${canonical}?q=beef`);
    const expectedRoute = publicRoute(new URL(request.url));
    const expectedKey = normalizedPublicRequest(request, origin, "v1").url;
    for (const alias of aliases) {
      const variant = new Request(`${origin}${alias}?q=beef`);
      expect(publicRoute(new URL(variant.url))).toEqual(expectedRoute);
      expect(normalizedPublicRequest(variant, origin, "v1").url).toBe(
        expectedKey,
      );
    }
  }
  for (const path of [
    "/API/V1/ME/ratings/",
    "/Sign-In/",
    "/us%2fsearch",
    "/us/search%2fextra",
    "/us/%ZZ",
  ]) {
    expect(publicRoute(new URL(path, origin))).toBeNull();
  }
  expect(() =>
    normalizedPublicRequest(
      new Request(`${origin}/US/search/`, { method: "POST" }),
      origin,
      "v1",
    ),
  ).toThrow();
});

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
  expect(normalized.redirect).toBe("manual");
  for (const header of ["Cookie", "Authorization", "Origin", "X-Render-Nonce"])
    expect(normalized.headers.has(header)).toBe(false);
  expect(normalized.url).not.toContain("utm_source");
  expect(normalized.url).toContain("__country=us");
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
  // Documents take their country from the path; a stray parameter is dropped.
  expect(
    normalizedPublicRequest(
      new Request(`${origin}/us/search?q=beef&country=CA`),
      origin,
      "v1",
    ).url,
  ).toBe(normalized.url);
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
    new Response("router data redirect", { status: 202 }),
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
      country: "us",
      categorySlugs: ["milk", "butter"],
    }),
  ).toEqual([
    "product:us:example",
    "category:us:milk",
    "category:us:butter",
    "surface:home:us",
    "surface:search:us",
    "surface:suggest:us",
  ]);
  expect(invalidationTags({ kind: "profile", slug: "example" })).toEqual([
    "profile:example",
  ]);
  // Every country page names categories in its aisle bar.
  expect(invalidationTags({ kind: "category", slug: "milk" })).toEqual([
    "category:milk",
    "surface:home",
    "surface:search",
    "surface:suggest",
    "surface:category",
    "surface:product",
  ]);
  expect(() =>
    invalidationTags({ kind: "product", slug: "bad,tag", country: "us" }),
  ).toThrow();
  // Product slugs are unique only within a country.
  expect(() =>
    invalidationTags({ kind: "product", slug: "example" }),
  ).toThrow();
  // Comments change only the product page; retailer reports also feed the
  // store filter on the product's rankings.
  expect(
    invalidationTags({
      kind: "product",
      slug: "example",
      country: "ca",
      categorySlugs: ["milk"],
      scope: "page",
    }),
  ).toEqual(["product:ca:example"]);
  expect(
    invalidationTags({
      kind: "product",
      slug: "example",
      country: "ca",
      categorySlugs: ["milk"],
      scope: "listings",
    }),
  ).toEqual(["product:ca:example", "category:ca:milk"]);
});

it("routes every country through the same public boundary and tags it", () => {
  const route = (path: string) => publicRoute(new URL(path, origin));
  expect(route("/ca")).toMatchObject({ kind: "home", country: "ca" });
  expect(route("/")).toMatchObject({ kind: "home", country: "us" });
  expect(route("/gb/search")).toMatchObject({ kind: "search", country: "gb" });
  expect(route("/au/products/oat-milk")).toMatchObject({
    kind: "product",
    country: "au",
    slug: "oat-milk",
  });
  expect(route("/NZ/Ground-Beef")).toMatchObject({
    kind: "category",
    country: "nz",
    slug: "ground-beef",
  });
  expect(route("/ie/ground-beef.data")).toMatchObject({
    kind: "category",
    representation: "data",
    country: "ie",
  });
  expect(route("/api/v1/categories/milk?country=CA")).toMatchObject({
    kind: "category",
    country: "ca",
  });
  expect(route("/api/v1/categories/milk")).toMatchObject({ country: "us" });
  expect(route("/api/v1/search?country=usa")).toBeNull();
  // Utility pages are not public catalog reads; three-letter segments are not countries.
  for (const path of ["/abc", "/sign-in", "/abc/ground-beef"])
    expect(route(path)).toBeNull();
  const key = (path: string) =>
    new URL(
      normalizedPublicRequest(new Request(`${origin}${path}`), origin, "v1")
        .url,
    );
  expect(key("/ca/milk").searchParams.get("__country")).toBe("ca");
  expect(
    key("/api/v1/categories/milk?country=GB").searchParams.get("country"),
  ).toBe("gb");
  expect(key("/users/example").searchParams.has("__country")).toBe(false);
  const tags = (path: string) =>
    cachePublicResponse(new Response("ok"), route(path)!).headers.get(
      "Cache-Tag",
    );
  expect(tags("/ca/milk")).toBe(
    "catalog:ca,surface:category,surface:category:ca,category:milk,category:ca:milk",
  );
  expect(tags("/ca/products/oat-milk")).toBe(
    "catalog:ca,surface:product,surface:product:ca,product:ca:oat-milk",
  );
});

it("gives each filter combination one normalized cache identity", () => {
  const url = (path: string) => new URL(path, origin);
  const redirect = (path: string) =>
    publicRedirect(url(path), publicRoute(url(path))!);
  expect(redirect("/us")).toBe("/");
  expect(redirect("/ca")).toBeNull();
  expect(redirect("/us/milk?stores=kroger,target")).toBeNull();
  expect(redirect("/us/milk?stores=Target&stores=kroger&page=3")).toBe(
    "/us/milk?stores=kroger%2Ctarget",
  );
  expect(redirect("/us/milk?freeFrom=soy,SOY,milk&view=trending")).toBe(
    "/us/milk?freeFrom=milk%2Csoy&view=trending",
  );
  expect(redirect("/us/milk?stores=a%20b,target")).toBe(
    "/us/milk?stores=target",
  );
  // The redirect target is a fixed point.
  const target = redirect("/us/milk?stores=Target&stores=kroger")!;
  expect(redirect(target)).toBeNull();
  // Framework data and API reads normalize silently into the same key.
  const key = (path: string) =>
    normalizedPublicRequest(new Request(`${origin}${path}`), origin, "v1").url;
  expect(key("/us/milk.data?stores=target&stores=kroger")).toBe(
    key("/us/milk.data?stores=kroger,target"),
  );
  expect(key("/us/milk?stores=kroger,target")).not.toBe(key("/us/milk"));
  expect(
    new URL(key("/us/milk?freeFrom=soy&utm=1")).searchParams.get("freeFrom"),
  ).toBe("soy");
});

it("shares validated image variants while allowing moderation revocation", () => {
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
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=0");
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

it("keeps Top, Trending and New category views as separate cache identities", () => {
  const origin = "https://staging.veganalts.com";
  const key = (query: string) =>
    normalizedPublicRequest(
      new Request(`${origin}/us/ground-beef${query}`),
      origin,
      "v1",
    ).url;
  expect(key("?view=trending")).not.toBe(key(""));
  expect(key("?view=trending")).not.toBe(key("?view=new"));
  expect(new URL(key("?view=new&utm_source=x")).searchParams.get("view")).toBe(
    "new",
  );
});

it("caches instant answers by country and query only, for five minutes", () => {
  const route = publicRoute(
    new URL(`${origin}/api/v1/suggest?q=beef&country=CA`),
  );
  expect(route).toMatchObject({ kind: "suggest", ttl: 300, country: "ca" });
  const key = new URL(
    normalizedPublicRequest(
      new Request(`${origin}/api/v1/suggest?country=ca&q=%20beef&utm=x`),
      origin,
      "v1",
    ).url,
  );
  expect(key.searchParams.get("q")).toBe("beef");
  expect(key.searchParams.get("utm")).toBeNull();
  expect(key.searchParams.get("country")).toBe("ca");
});
