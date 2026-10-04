import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/auth/*", "routes/auth-api.ts"),
  route("sign-in", "routes/sign-in.tsx"),
  route("account", "routes/account.tsx"),
  route("admin/media", "routes/admin-media.tsx"),
  route("api/v1/media/uploads", "routes/media-upload.ts"),
  route("media/:imageId/:variant", "routes/media.ts"),
] satisfies RouteConfig;
