import { publicRoute } from "./public-cache";

export function conditionalMediaResponse(response: Response, request: Request) {
  const etag = response.headers.get("ETag");
  if (
    response.status !== 200 ||
    !etag ||
    !["GET", "HEAD"].includes(request.method)
  )
    return response;
  // Evaluate the visitor's validator after the shared entrypoint has served the
  // full representation. A client-specific 304 never becomes a cached object.
  const matched = request.headers
    .get("If-None-Match")
    ?.split(",")
    .some((value) => {
      const tag = value.trim();
      return (
        tag === "*" || tag.replace(/^W\//, "") === etag.replace(/^W\//, "")
      );
    });
  return matched
    ? new Response(null, { status: 304, headers: response.headers })
    : response;
}

export function canonicalRedirect(request: Request, environment: string) {
  const url = new URL(request.url);
  if (
    environment === "production" &&
    (url.hostname === "www.veganalts.com" ||
      (url.hostname === "veganalts.com" && url.protocol !== "https:"))
  ) {
    url.protocol = "https:";
    url.hostname = "veganalts.com";
    return Response.redirect(url, 308);
  }
  return null;
}

export function responsePolicy(
  response: Response,
  request: Request,
  environment: string,
  requestId: string,
  nonce?: string,
) {
  const result = new Response(response.body, response);
  const headers = result.headers;
  headers.set("X-Request-ID", requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (environment !== "local") {
    headers.set("Strict-Transport-Security", "max-age=31536000");
    headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' ${nonce ? `'nonce-${nonce}'` : ""} https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://*.cloudflareinsights.com https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com https://appleid.apple.com; upgrade-insecure-requests`,
    );
  }
  if (environment !== "production")
    headers.set("X-Robots-Tag", "noindex, nofollow");
  const url = new URL(request.url);
  const path = url.pathname;
  const route = publicRoute(url);
  const publicRead =
    (request.method === "GET" || request.method === "HEAD") &&
    !headers.has("Set-Cookie") &&
    !/private|no-store/i.test(headers.get("Cache-Control") ?? "") &&
    (response.status === 200 || response.status === 304) &&
    (route !== null ||
      path.startsWith("/media/") ||
      path.startsWith("/assets/") ||
      ["/favicon.svg", "/social.png", "/social.svg", "/robots.txt"].includes(
        path,
      ));
  if (!publicRead) headers.set("Cache-Control", "private, no-store");
  else if (route && route.kind !== "media")
    headers.set("Cache-Control", "public, max-age=0");
  return result;
}
