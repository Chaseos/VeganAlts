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
    // Only application destinations; exclude auth/API redirects and asset URLs.
    if (
      !/^\/(?:us(?:\/(?:search|[a-z0-9-]+|products\/[a-z0-9-]+))?|users\/[a-z0-9_]+|my-ratings|account)?$/.test(
        url.pathname,
      )
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
