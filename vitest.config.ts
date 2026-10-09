import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "domain",
          include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
          environment: "node",
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            miniflare: {
              compatibilityDate: "2026-10-01",
              compatibilityFlags: ["nodejs_compat"],
              d1Databases: ["DB", "DB_UPGRADE"],
              r2Buckets: ["MEDIA_BUCKET"],
              images: { binding: "IMAGES" },
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations("./db/migrations"),
                TEST_IMAGES: Object.fromEntries(
                  [
                    ["png", "evidence.png"],
                    ["jpeg", "small.jpg"],
                    ["webp", "sample.webp"],
                  ].map(([key, file]) => [
                    key,
                    readFileSync(`tests/fixtures/${file}`).toString("base64"),
                  ]),
                ),
              },
            },
          })),
        ],
        test: {
          name: "persistence",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
