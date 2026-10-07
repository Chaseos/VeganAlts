import { env } from "cloudflare:workers";
import { applyD1Migrations, type D1Migration } from "cloudflare:test";

declare global {
  namespace Cloudflare {
    interface Env {
      DB_UPGRADE: D1Database;
      TEST_MIGRATIONS: D1Migration[];
      TEST_IMAGES: Record<"png" | "jpeg" | "webp", string>;
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
