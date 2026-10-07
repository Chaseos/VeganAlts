import { ApplicationError } from "../domain/errors";

export interface PublicRoute {
  kind: "home" | "search" | "category" | "product" | "profile" | "media";
  representation: "document" | "data" | "api" | "image";
  pathname: string;
  ttl: number;
  slug?: string;
}
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
  if (path === "/" || path === "/api/v1/categories")
    return { ...canonical, kind: "home", ttl: 1800 };
  if (path === "/us/search" || path === "/api/v1/search")
    return { ...canonical, kind: "search", ttl: 600 };
  let match = path.match(
    /^\/(?:us\/products|api\/v1\/products)\/([a-z0-9-]+)$/,
  );
  if (match) return { ...canonical, kind: "product", ttl: 900, slug: match[1] };
  match = path.match(/^\/(?:users|api\/v1\/profiles)\/([a-z0-9_]+)$/);
  if (match) return { ...canonical, kind: "profile", ttl: 600, slug: match[1] };
  match = path.match(/^\/(?:us|api\/v1\/categories)\/([a-z0-9-]+)$/);
  if (match)
    return { ...canonical, kind: "category", ttl: 600, slug: match[1] };
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
  if (
    incoming.searchParams.has("country") &&
    incoming.searchParams.get("country") !== "US"
  )
    throw new ApplicationError(
      "UNSUPPORTED_COUNTRY",
      "Choose the United States catalog.",
    );
  const url = new URL(route.pathname, origin);
  const keys =
    route.kind === "search"
      ? ["q"]
      : route.kind === "category"
        ? ["page", "unrankedPage"]
        : route.kind === "product"
          ? ["version"]
          : [];
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
    if (value.length > (key === "_routes" ? 1000 : key === "q" ? 80 : 100))
      throw new ApplicationError("INVALID_QUERY", "The query is too long.");
    if (key === "q") value = value.normalize("NFKC").trim();
    if (key === "_routes")
      value = [...new Set(value.split(","))].sort().join(",");
    if (value) url.searchParams.set(key, value);
  }
  url.searchParams.set("__country", "US");
  url.searchParams.set("__representation", route.representation);
  url.searchParams.set("__deployment", version);
  url.searchParams.sort();
  // No Cookie, Authorization, Origin, personal validators or client-chosen
  // nonce survives this boundary. Public loaders receive only normalized input.
  return new Request(url, {
    method: "GET",
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
  return [
    "catalog:US",
    `surface:${route.kind}`,
    ...(route.slug ? [`${route.kind}:${route.slug}`] : []),
  ];
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
  categorySlugs?: string[];
}
export function invalidationTags(change: MaterialCatalogChange) {
  if (
    !/^[a-z0-9_-]{1,100}$/.test(change.slug) ||
    (change.categorySlugs ?? []).some(
      (slug) => !/^[a-z0-9-]{1,100}$/.test(slug),
    )
  )
    throw new ApplicationError(
      "INVALID_INVALIDATION",
      "Invalid catalog change.",
    );
  if (change.kind === "profile") return [`profile:${change.slug}`];
  if (change.kind === "media") return [`media:${change.slug}`];
  return [
    ...new Set([
      `${change.kind}:${change.slug}`,
      "surface:home",
      "surface:search",
      ...(change.categorySlugs?.map((slug) => `category:${slug}`) ?? []),
      ...(change.kind === "category" ? ["surface:product"] : []),
    ]),
  ];
}
