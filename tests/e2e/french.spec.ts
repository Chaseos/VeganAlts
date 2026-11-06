import { expect, test } from "./fixtures";
import { accessible } from "./a11y";

test("Canadian French pages read in French and pass accessibility", async ({
  page,
}) => {
  await page.goto("/ca/fr");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("main")).not.toContainText("Find swaps");
  await accessible(page);
});

test("a food page shows its French name and links other languages", async ({
  page,
}) => {
  await page.goto("/ca/fr/milk");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("lait");
  await expect(
    page.locator('link[rel="alternate"][hreflang="en-CA"]'),
  ).toHaveAttribute("href", /\/ca\/en\/milk$/);
  await accessible(page);
});

test("the French dictionary loads before hydration", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto("/ca/fr/milk");
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});

test("English pages don't load the French dictionary", async ({ page }) => {
  const chunks: string[] = [];
  page.on("response", (response) => chunks.push(response.url()));
  await page.goto("/us/en/milk");
  await page.waitForLoadState("networkidle");
  expect(chunks.filter((url) => /i18n\/(?:fr|ja)/.test(url))).toEqual([]);
});
