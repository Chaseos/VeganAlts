import { ApplicationError } from "../domain/errors";
import {
  applyFilters,
  filtersAreNormalized,
  readFilters,
} from "../../catalog/domain/filters";

export interface PublicRoute {
  kind:
    | "home"
    | "search"
    | "category"
    | "product"
    | "comments"
    | "profile"
    | "policy"
    | "sitemap"
    | "media";
  representation: "document" | "data" | "api" | "image";
  pathname: string;
  ttl: number;
  slug?: string;
  // Lowercase ISO code of the catalog a read belongs to. Documents carry it in
  // the path; public API reads take a `country` query parameter (default us).
  country?: string;
}

const COUNTRY = "[a-z]{2}";
const ROUTE_COUNTRY = new RegExp(`^/(${COUNTRY})(?:/|$)`);
export function publicRoute(url: URL): PublicRoute | null {
  const data = url.pathname.endsWith(".data");
  let path = data
    ? url.pathname === "/_root.data"
      ? "/"
      : url.pathname.slice(0, -5)
    : url.pathname;
  // Match the router's decoded segments, case-insensitive paths and trailing
  // slashes before dispatch. Encoded slashes must remain within their segment.
  try {
    path = path
      .split("/")
      .map((segment) => decodeURIComponent(segment).replaceAll("/", "%2F"))
      .join("/");
  } catch {
    return null;
  }
  path = path.replace(/\/+$/, "") || "/";
  const media =
    !data &&
    path.match(/^\/media\/([a-zA-Z0-9_-]{1,100})\/(full|thumbnail|evidence)$/i);
  if (media)
    return {
      kind: "media",
      representation: "image",
      pathname: `/media/${media[1]}/${media[2]!.toLowerCase()}`,
      ttl: 86400,
      slug: media[1],
    };
  path = path.toLowerCase();
  const representation = data
    ? "data"
    : path.startsWith("/api/")
      ? "api"
      : "document";
  const canonical: Pick<PublicRoute, "representation" | "pathname"> = {
    representation,
    pathname: data ? (path === "/" ? "/_root.data" : `${path}.data`) : path,
  };
  const apiCountry =
    representation === "api"
      ? (url.searchParams.get("country") ?? "us").toLowerCase()
      : null;
  if (apiCountry !== null && !/^[a-z]{2}$/.test(apiCountry)) return null;
  const pathCountry = path.match(ROUTE_COUNTRY)?.[1];
  const country = apiCountry ?? pathCountry ?? "us";
  if (path === "/" || path === "/api/v1/categories")
    return { ...canonical, kind: "home", ttl: 1800, country };
  if (path === "/sitemap.xml")
    return { ...canonical, kind: "sitemap", ttl: 3600 };
  const policy = path.match(/^\/about\/([a-z-]+)$/);
  // Policies change rarely and are long-lived.
  if (policy)
    return { ...canonical, kind: "policy", ttl: 86400, slug: policy[1] };
  let match = path.match(/^\/(?:users|api\/v1\/profiles)\/([a-z0-9_]+)$/);
  if (match) return { ...canonical, kind: "profile", ttl: 600, slug: match[1] };
  if (new RegExp(`^/${COUNTRY}$`).test(path))
    return { ...canonical, kind: "home", ttl: 1800, country };
  if (
    new RegExp(`^/${COUNTRY}/search$`).test(path) ||
    path === "/api/v1/search"
  )
    return { ...canonical, kind: "search", ttl: 600, country };
  match = data
    ? null
    : path.match(/^\/api\/v1\/products\/([a-z0-9-]+)\/comments$/);
  // Comment pages share the product's purge tag and refresh within a minute.
  if (match)
    return { ...canonical, kind: "comments", ttl: 60, slug: match[1], country };
  match = path.match(
    new RegExp(`^/(?:${COUNTRY}/products|api/v1/products)/([a-z0-9-]+)$`),
  );
  if (match)
    return { ...canonical, kind: "product", ttl: 900, slug: match[1], country };
  match = path.match(
    new RegExp(`^/(?:${COUNTRY}|api/v1/categories)/([a-z0-9-]+)$`),
  );
  if (match)
    return {
      ...canonical,
      kind: "category",
      ttl: 600,
      slug: match[1],
      country,
    };
  return null;
}

// Permanent redirects decided from the URL alone, before any cache lookup or
// D1 read: the United States home lives at "/", and filter parameters have one
// normalized form so each filter combination is cached once.
export function publicRedirect(url: URL, route: PublicRoute) {
  if (route.representation !== "document") return null;
  if (route.kind === "home" && route.pathname === "/us") return "/";
  if (route.kind === "category" && !filtersAreNormalized(url.searchParams)) {
    const target = new URL(url);
    const params = applyFilters(
      url.searchParams,
      readFilters(url.searchParams),
    );
    params.delete("page");
    target.search = params.size ? `?${params}` : "";
    return `${target.pathname}${target.search}`;
  }
  return null;
}

export function normalizedPublicRequest(
  request: Request,
  origin: string,
  version: string,
) {
  const incoming = new URL(request.url);
  const route = publicRoute(incoming);
  if (!route || !["GET", "HEAD"].includes(request.method))
    throw new ApplicationError(
      "INVALID_PUBLIC_REQUEST",
      "This request cannot use public caching.",
    );
  const url = new URL(route.pathname, origin);
  const keys =
    route.kind === "search"
      ? ["q"]
      : route.kind === "category"
        ? ["page", "unrankedPage", "view", "shelf"]
        : route.kind === "product"
          ? ["version"]
          : route.kind === "comments"
            ? ["sort", "formula", "cursor"]
            : [];
  if (route.kind === "category") {
    // Several values are allowed and merged into one normalized parameter.
    const filters = readFilters(incoming.searchParams);
    if (filters.stores.length)
      url.searchParams.set("stores", filters.stores.join(","));
    if (filters.freeFrom.length)
      url.searchParams.set("freeFrom", filters.freeFrom.join(","));
  }
  if (route.representation === "api" && route.country)
    url.searchParams.set("country", route.country);
  if (route.representation === "data") keys.push("_routes");
  for (const key of keys) {
    const values = incoming.searchParams.getAll(key);
    if (values.length > 1)
      throw new ApplicationError(
        "INVALID_QUERY",
        "Use each query parameter only once.",
      );
    let value = values[0];
    if (!value) continue;
    if (
      value.length >
      (key === "_routes"
        ? 1000
        : key === "q"
          ? 80
          : key === "cursor"
            ? 300
            : 100)
    )
      throw new ApplicationError("INVALID_QUERY", "The query is too long.");
    if (key === "q") value = value.normalize("NFKC").trim();
    if (key === "_routes")
      value = [...new Set(value.split(","))].sort().join(",");
    if (value) url.searchParams.set(key, value);
  }
  if (route.country) url.searchParams.set("__country", route.country);
  url.searchParams.set("__representation", route.representation);
  url.searchParams.set("__deployment", version);
  url.searchParams.sort();
  // No Cookie, Authorization, Origin, personal validators or client-chosen
  // nonce survives this boundary. Public loaders receive only normalized input.
  return new Request(url, {
    method: "GET",
    // The internal fetch must return uncached redirects to the visitor instead
    // of following them and potentially caching the survivor under the donor.
    redirect: "manual",
    headers: {
      Accept: route.representation === "document" ? "text/html" : "*/*",
      "X-Request-ID":
        request.headers.get("X-Request-ID") ?? crypto.randomUUID(),
    },
  });
}

export const edgeCacheControl = (ttl: number) =>
  `public, max-age=${ttl}, stale-while-revalidate=60, stale-if-error=86400`;
export function publicCacheTags(route: PublicRoute) {
  const country = route.country;
  const tags = country
    ? [
        `catalog:${country}`,
        `surface:${route.kind}`,
        `surface:${route.kind}:${country}`,
      ]
    : [`surface:${route.kind}`];
  if (route.slug) {
    if (route.kind === "category")
      tags.push(`category:${route.slug}`, `category:${country}:${route.slug}`);
    else if (route.kind === "product" || route.kind === "comments")
      // Product slugs are unique only within a country.
      tags.push(`product:${country}:${route.slug}`);
    else tags.push(`${route.kind}:${route.slug}`);
  }
  return tags;
}

export function cachePublicResponse(response: Response, route: PublicRoute) {
  const result = new Response(response.body, response);
  if (
    result.status !== 200 ||
    result.headers.has("Set-Cookie") ||
    /private|no-store/i.test(result.headers.get("Cache-Control") ?? "")
  ) {
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
  } else {
    result.headers.set("Cache-Control", "public, max-age=0");
    result.headers.set(
      "Cloudflare-CDN-Cache-Control",
      edgeCacheControl(route.ttl),
    );
    result.headers.set("Cache-Tag", publicCacheTags(route).join(","));
  }
  return result;
}

export interface MaterialCatalogChange {
  kind: "product" | "category" | "profile" | "media";
  slug: string;
  // Required for products: their slugs are unique only within a country.
  country?: string;
  categorySlugs?: string[];
  // How far a product change reaches: its own page; its page and its foods'
  // rankings (retailer reports feed the store filter); or everything that
  // lists it (default).
  scope?: "page" | "listings" | "all";
}
export function invalidationTags(change: MaterialCatalogChange) {
  if (
    !/^[a-z0-9_-]{1,100}$/.test(change.slug) ||
    (change.country !== undefined && !/^[a-z]{2}$/.test(change.country)) ||
    (change.categorySlugs ?? []).some(
      (slug) => !/^[a-z0-9-]{1,100}$/.test(slug),
    ) ||
    (change.kind === "product" && !change.country)
  )
    throw new ApplicationError(
      "INVALID_INVALIDATION",
      "Invalid catalog change.",
    );
  if (change.kind === "profile") return [`profile:${change.slug}`];
  if (change.kind === "media") return [`media:${change.slug}`];
  if (change.kind === "category")
    // The aisle bar and menus on every country page name categories.
    return [
      `category:${change.slug}`,
      ...["home", "search", "category", "product"].map(
        (kind) => `surface:${kind}`,
      ),
    ];
  const country = change.country!;
  const scope = change.scope ?? "all";
  return [
    ...new Set([
      `product:${country}:${change.slug}`,
      ...(scope === "page"
        ? []
        : (change.categorySlugs ?? []).map(
            (slug) => `category:${country}:${slug}`,
          )),
      ...(scope === "all"
        ? [`surface:home:${country}`, `surface:search:${country}`]
        : []),
    ]),
  ];
}
