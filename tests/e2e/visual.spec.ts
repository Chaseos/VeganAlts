import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "./fixtures";
import { createBrowserSession } from "./session-fixture";
import { withLocalDb } from "./local-db";

// Screenshots for comparing pages with the Round 5 canvas boards by eye, and
// for the owner's review of milestone 6 screens.
// Run with CAPTURE=1 (and optionally CAPTURE_DIR); skipped otherwise. Captures
// stay local in the ignored test-results folder and are never committed.
const PAGES = [
  ["home", "/"],
  ["aisle", "/us/beef"],
  ["category", "/us/ground-beef"],
  ["product", "/us/products/beyond-beef"],
  ["search", "/us/search?q=beef"],
  ["food-silent-aisle", "/us/eggs"],
  ["aisle-single-food", "/us/butter-aisle"],
  ["seasonal-food", "/us/eggnog"],
  ["empty-country", "/ca"],
  // Milestone 7: a line of several flavors, Tastiest, a flavor and a brand.
  ["line-food", "/us/milk"],
  ["tastiest", "/us/milk?view=tastiest"],
  ["flavor-product", "/us/products/oatly-full-fat?food=milk"],
  ["brand", "/us/brand/oatly"],
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
      process.env.CAPTURE_DIR ?? join("test-results", "captures");
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
  const directory = process.env.CAPTURE_DIR ?? join("test-results", "captures");
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
  const directory = process.env.CAPTURE_DIR ?? join("test-results", "captures");
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

// Add a product, both steps and the open food picker (local sessions).
test("capture add-product", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One capture per page.");
  test.skip(Boolean(process.env.TEST_BASE_URL), "Sessions are local.");
  test.setTimeout(240000);
  const directory = process.env.CAPTURE_DIR ?? join("test-results", "captures");
  mkdirSync(directory, { recursive: true });
  const contributor = await createBrowserSession();
  try {
    await context.addCookies([contributor.cookie]);
    for (const [label, width, height] of WIDTHS)
      for (const scheme of ["light", "dark"] as const) {
        await page.setViewportSize({ width, height });
        await page.emulateMedia({
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        const shot = (name: string) =>
          page.screenshot({
            path: join(directory, `add-product-${name}-${label}-${scheme}.jpg`),
            type: "jpeg",
            quality: 70,
            fullPage: true,
          });
        await page.goto("/add-product?country=gb");
        await page.evaluate(() => sessionStorage.clear());
        await page.reload();
        await page.locator("main").waitFor();
        await page.waitForTimeout(300);
        await shot("basics");
        await page
          .getByRole("combobox", {
            name: "What food does it replace? (required)",
          })
          .fill("bee");
        await page.waitForTimeout(200);
        await shot("picker");
        await page.getByRole("option").first().click();
        await page.getByLabel("Brand (required)").fill("Richmond");
        await page
          .getByLabel("Product name (required)")
          .fill("Meat Free Sausages");
        await page
          .getByLabel("Front of pack photo (required)")
          .setInputFiles("tests/fixtures/small.jpg");
        await page.getByRole("button", { name: "Continue" }).click();
        await page
          .locator("details.va-optional")
          .first()
          .locator("summary")
          .click();
        await page.waitForTimeout(200);
        await shot("more");
      }
  } finally {
    await contributor.dispose();
  }
});
