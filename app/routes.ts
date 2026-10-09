import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  // Every country's catalog shares one layout (header, aisles, footer). "/" is
  // the United States home; static first segments below outrank ":country".
  layout("routes/country-layout.tsx", [
    index("routes/home.tsx"),
    ...prefix(":country", [
      index("routes/home.tsx", { id: "routes/country-home" }),
      route("search", "routes/search.tsx"),
      route("products/:productSlug", "routes/product.tsx"),
      route(":categorySlug", "routes/category.tsx"),
    ]),
  ]),
  route("users/:handle", "routes/profile.tsx"),
  route("about/:page", "routes/policy.tsx"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("my-ratings", "routes/my-ratings.tsx"),
  route("add-product", "routes/add-product.tsx"),
  route("propose-category", "routes/propose-category.tsx"),
  route("admin/taxonomy", "routes/admin-taxonomy.tsx"),
  route("contribute/:productId", "routes/contribute.tsx"),
  route("my-contributions/:kind?/:id?", "routes/my-contributions.tsx"),
  route("admin/moderation/*", "routes/moderation.tsx"),
  route("api/auth/*", "routes/auth-api.ts"),
  route("sign-in", "routes/sign-in.tsx"),
  route("auth/return", "routes/auth-return.ts"),
  route("account", "routes/account.tsx"),
  route("admin/media", "routes/admin-media.tsx"),
  route("api/v1/media/uploads", "routes/media-upload.ts"),
  route("api/v1/*", "routes/application-api.ts"),
  route("media/:imageId/:variant", "routes/media.ts"),
] satisfies RouteConfig;
