import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";
import { LANGUAGES } from "../server/catalog/domain/languages";

// One country's pages in one language. Every address names both.
const countryPages = (language: string) => {
  const id = (file: string) => `${file}-${language}`;
  return prefix(`:country/${language}`, [
    index("routes/home.tsx", { id: id("routes/country-home") }),
    route("search", "routes/search.tsx", { id: id("routes/search") }),
    route("products/:productSlug", "routes/product.tsx", {
      id: id("routes/product"),
    }),
    route("brand/:brandSlug", "routes/brand.tsx", { id: id("routes/brand") }),
    route(":categorySlug", "routes/category.tsx", {
      id: id("routes/category"),
    }),
  ]);
};

export default [
  // Every country's catalog shares one layout (header, aisles, footer). "/" shows
  // the United States home and sends a returning visitor to their country.
  layout("routes/country-layout.tsx", [
    index("routes/home.tsx"),
    ...LANGUAGES.flatMap(countryPages),
  ]),
  route("users/:handle", "routes/profile.tsx"),
  route("about/:page", "routes/policy.tsx"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("my-ratings", "routes/my-ratings.tsx"),
  route("saved", "routes/saved.tsx"),
  route("add-product", "routes/add-product.tsx"),
  route("propose-category", "routes/propose-category.tsx"),
  route("report-food", "routes/report-food.tsx"),
  route("admin/taxonomy", "routes/admin-taxonomy.tsx"),
  route("admin/analytics", "routes/admin-analytics.tsx"),
  route("contribute/:productId", "routes/contribute.tsx"),
  route("my-contributions/:kind?/:id?", "routes/my-contributions.tsx"),
  route("admin/moderation/*", "routes/moderation.tsx"),
  route("api/auth/*", "routes/auth-api.ts"),
  route("sign-in", "routes/sign-in.tsx"),
  route("auth/return", "routes/auth-return.ts"),
  route("account", "routes/account.tsx"),
  route("api/v1/media/uploads", "routes/media-upload.ts"),
  route("api/v1/*", "routes/application-api.ts"),
  route("media/:imageId/:variant", "routes/media.ts"),
] satisfies RouteConfig;
