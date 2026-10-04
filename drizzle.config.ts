import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./db/schema/auth.ts",
    "./db/schema/app.ts",
    "./db/schema/operations.ts",
  ],
  out: "./db/migrations",
  strict: true,
  verbose: true,
});
