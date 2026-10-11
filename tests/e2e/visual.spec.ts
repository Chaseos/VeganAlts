import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "./fixtures";
import { createBrowserSession } from "./session-fixture";
import { withLocalDb } from "./local-db";

// Screenshots for comparing pages with the Round 5 canvas boards by eye, and
// for the owner's review of milestone 6 screens.
// Run with CAPTURE=1 (and optionally CAPTURE_DIR); skipped otherwise. JPEG keeps
// the committed evidence small.
const PAGES = [
  ["home", "/"],
  ["aisle", "/us/meat"],
  ["category", "/us/ground-beef"],
  ["product", "/us/products/beyond-beef"],
  ["search", "/us/search?q=beef"],
  ["food-silent-shelf", "/us/eggs"],
  ["aisle-silent-shelves", "/us/dairy"],
  ["empty-country", "/ca"],
] as const;
const WIDTHS = [
  ["phone", 390, 844],
  ["desktop", 1440, 900],
] as const;

test.skip(!process.env.CAPTURE, "Visual captures run with CAPTURE=1.");
test.describe.configure({ mode: "serial" });

for (const [name, path] of PAGES)
  test(`capture ${name}`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "One capture per page.");
    const directory =
      process.env.CAPTURE_DIR ?? join("docs", "verification", "milestone-6");
    mkdirSync(directory, { recursive: true });
    for (const [label, width, height] of WIDTHS)
      for (const scheme of ["light", "dark"] as const) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: join(directory, `${name}-${label}-${scheme}.jpg`),
          type: "jpeg",
          quality: 70,
          fullPage: true,
        });
      }
  });

// Signed-in workflow pages (local only: sessions are created in the database).
test("capture workflows", async ({ page, context, request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One capture per page.");
  test.skip(Boolean(process.env.TEST_BASE_URL), "Sessions are local.");
  test.setTimeout(240000);
  const directory =
    process.env.CAPTURE_DIR ?? join("docs", "verification", "milestone-6");
  mkdirSync(directory, { recursive: true });
  const operator = await createBrowserSession({ administrator: true });
  try {
    await context.addCookies([operator.cookie]);
    const product = (
      (await (await request.get("/api/v1/products/beyond-beef")).json()) as {
        data: { id: string };
      }
    ).data;
    for (const [name, path] of [
      ["add-product", "/add-product?country=us"],
      ["contribute", `/contribute/${product.id}`],
      ["propose-category", "/propose-category?country=us"],
      ["moderation", "/admin/moderation"],
      ["taxonomy", "/admin/taxonomy"],
      ["my-contributions", "/my-contributions"],
      ["my-ratings", "/my-ratings"],
      ["account", "/account"],
    ] as const)
      for (const [label, width, height] of WIDTHS)
        for (const scheme of ["light", "dark"] as const) {
          await page.setViewportSize({ width, height });
          await page.emulateMedia({
            colorScheme: scheme,
            reducedMotion: "reduce",
          });
          await page.goto(path);
          // Signed-in pages keep a session poll open, so wait for the main
          // landmark instead of network idle.
          await page.locator("main").waitFor();
          await page.waitForTimeout(400);
          await page.screenshot({
            path: join(directory, `${name}-${label}-${scheme}.jpg`),
            type: "jpeg",
            quality: 70,
            fullPage: true,
          });
        }
  } finally {
    await operator.dispose();
  }
});

// A food that is not on in a country (local only: availability is arranged in
// the database and restored afterwards).
test("capture not-here", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One capture per page.");
  test.skip(Boolean(process.env.TEST_BASE_URL), "Data setup is local.");
  const directory =
    process.env.CAPTURE_DIR ?? join("docs", "verification", "milestone-6");
  mkdirSync(directory, { recursive: true });
  const where =
    "category_id=(SELECT id FROM categories WHERE slug='bacon') AND country_id=(SELECT id FROM countries WHERE iso2='NZ')";
  await withLocalDb((db) =>
    db.prepare(`DELETE FROM category_countries WHERE ${where}`).run(),
  );
  try {
    for (const [label, width, height] of WIDTHS)
      for (const scheme of ["light", "dark"] as const) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        await page.goto("/nz/bacon");
        await page.waitForLoadState("networkidle");
        await page.screenshot({
          path: join(directory, `not-here-${label}-${scheme}.jpg`),
          type: "jpeg",
          quality: 70,
          fullPage: true,
        });
      }
  } finally {
    await withLocalDb((db) =>
      db
        .prepare(
          "INSERT INTO category_countries(category_id,country_id,source,created_at) SELECT c.id,co.id,'launch',1 FROM categories c,countries co WHERE c.slug='bacon' AND co.iso2='NZ' ON CONFLICT DO NOTHING",
        )
        .run(),
    );
  }
});
