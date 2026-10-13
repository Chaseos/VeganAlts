import { homePath, isCountryCode } from "../../catalog/domain/markets";

const PUBLIC_PATHS = [
  "[a-z]{2}(?:/(?:search|[a-z0-9-]+|(?:products|brand)/[a-z0-9-]+))?",
  "users/[a-z0-9_]+",
  "about/(?:terms|privacy|rankings|vegan-status|moderation|contact)",
];
const PUBLIC_PAGE = new RegExp(`^/(?:${PUBLIC_PATHS.join("|")})?$`);
const APPLICATION_PAGE = new RegExp(
  "^/(?:" +
    [
      ...PUBLIC_PATHS,
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

/** Cancel sign-in without re-entering a page that requires authentication. */
export function publicBrowseDestination(value: unknown, origin: string) {
  const destination = safeReturnDestination(value, origin, "/");
  const url = new URL(destination, origin);
  if (PUBLIC_PAGE.test(url.pathname)) return destination;
  const country = url.searchParams.get("country")?.toLowerCase();
  return country && isCountryCode(country) ? homePath(country) : "/";
}

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
