import { cloudflare } from "@cloudflare/vite-plugin";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } }), reactRouter()],
  resolve: { tsconfigPaths: true },
  // Every environment except production labels its demo catalog.
  define: {
    __VEGANALTS_PREVIEW__: JSON.stringify(
      process.env.CLOUDFLARE_ENV !== "production",
    ),
  },
  // Only lazily loaded contribution routes import zod in the browser. Without
  // pre-bundling, a cold dev server discovers it mid-navigation and reloads.
  optimizeDeps: { include: ["zod"] },
});
