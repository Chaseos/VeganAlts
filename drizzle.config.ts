import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./db/schema/auth.ts",
    "./db/schema/app.ts",
    "./db/schema/operations.ts",
    "./db/schema/community.ts",
    "./db/schema/taxonomy.ts",
  ],
  out: "./db/migrations",
  strict: true,
  verbose: true,
});
