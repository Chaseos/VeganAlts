export const PUBLIC_LANDING_CACHE_CONTROL =
  "public, max-age=0, s-maxage=1800, stale-while-revalidate=86400";

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
      "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://accounts.google.com https://appleid.apple.com; upgrade-insecure-requests",
    );
  }
  if (environment !== "production")
    headers.set("X-Robots-Tag", "noindex, nofollow");
  const path = new URL(request.url).pathname;
  const publicRead =
    (request.method === "GET" || request.method === "HEAD") &&
    !headers.has("Set-Cookie") &&
    (response.status === 200 || response.status === 304) &&
    (path === "/" ||
      path.startsWith("/media/") ||
      path.startsWith("/assets/") ||
      ["/favicon.svg", "/social.png", "/social.svg", "/robots.txt"].includes(
        path,
      ));
  if (!publicRead) headers.set("Cache-Control", "private, no-store");
  else if (path === "/")
    headers.set("Cache-Control", PUBLIC_LANDING_CACHE_CONTROL);
  return result;
}
