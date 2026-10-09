const APPLICATION_PAGE = new RegExp(
  "^/(?:" +
    [
      "[a-z]{2}(?:/(?:search|[a-z0-9-]+|products/[a-z0-9-]+))?",
      "users/[a-z0-9_]+",
      "my-ratings",
      "account",
      "add-product",
      "propose-category",
      "contribute/[a-zA-Z0-9_-]+",
      "my-contributions(?:/[a-z]+/[a-zA-Z0-9_-]+)?",
      "admin/(?:taxonomy|media|moderation(?:/[a-zA-Z0-9_/-]+)?)",
    ].join("|") +
    ")?$",
);

export function safeReturnDestination(
  value: unknown,
  origin: string,
  fallback = "/account",
) {
  if (
    typeof value !== "string" ||
    value.length > 1024 ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.username || url.password)
      return fallback;
    // A client navigation's loader sees the page's data URL; return to the
    // page itself.
    if (url.pathname.endsWith(".data")) {
      url.pathname =
        url.pathname === "/_root.data" ? "/" : url.pathname.slice(0, -5);
      url.searchParams.delete("_routes");
    }
    // Only application pages; exclude auth/API redirects and asset URLs.
    if (!APPLICATION_PAGE.test(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
