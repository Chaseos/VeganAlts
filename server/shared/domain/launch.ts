/**
 * Production serves only the coming-soon page until PUBLIC_LAUNCH is "true".
 * Local and staging always serve the catalog. Cutover is a configuration
 * change plus deployment, never a code change.
 */
export function catalogIsPublic(env: {
  APP_ENV: string;
  PUBLIC_LAUNCH?: string;
}) {
  return env.APP_ENV !== "production" || env.PUBLIC_LAUNCH === "true";
}

/** Staging is never crawled; production lists its sitemap once launched. */
export function robotsTxt(env: {
  APP_ENV: string;
  APP_URL: string;
  PUBLIC_LAUNCH?: string;
}) {
  if (env.APP_ENV !== "production") return "User-agent: *\nDisallow: /\n";
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /account",
    "Disallow: /sign-in",
    "Disallow: /admin/",
    "Disallow: /my-ratings",
    "Disallow: /my-contributions",
    "Disallow: /contribute/",
    "Disallow: /add-product",
    "Disallow: /propose-category",
    "Disallow: /us/search",
    ...(catalogIsPublic(env)
      ? [`Sitemap: ${new URL("/sitemap.xml", env.APP_URL).href}`]
      : []),
    "",
  ].join("\n");
}
