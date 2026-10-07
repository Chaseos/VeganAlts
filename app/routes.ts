import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("us/search", "routes/search.tsx"),
  route("us/products/:productSlug", "routes/product.tsx"),
  route("us/:categorySlug", "routes/category.tsx"),
  route("users/:handle", "routes/profile.tsx"),
  route("my-ratings", "routes/my-ratings.tsx"),
  route("add-product", "routes/add-product.tsx"),
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
