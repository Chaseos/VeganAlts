import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "./fixtures";

// Screenshots for comparing pages with the Round 5 canvas boards by eye.
// Run with CAPTURE=1 (and optionally CAPTURE_DIR); skipped otherwise.
const PAGES = [
  ["home", "/"],
  ["aisle", "/us/meat"],
  ["category", "/us/ground-beef"],
  ["product", "/us/products/beyond-beef"],
  ["search", "/us/search?q=beef"],
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
      process.env.CAPTURE_DIR ?? join("docs", "verification", "milestone-5");
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
          path: join(directory, `${name}-${label}-${scheme}.png`),
          fullPage: true,
        });
      }
  });
