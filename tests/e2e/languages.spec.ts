import { expect, test } from "./fixtures";

test("the switcher saves a language, and an address without one follows it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The phone menu lists the same links.");
  await page.goto("/ca/en/milk");
  await page.getByLabel(/^Language: English/).click();
  await page.getByRole("link", { name: "Français" }).click();
  await expect(page).toHaveURL(/\/ca\/fr\/milk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await page.goto("/ca/milk");
  await expect(page).toHaveURL(/\/ca\/fr\/milk$/);
  // An explicit address always shows what it says.
  await page.goto("/ca/en/milk");
  await expect(page).toHaveURL(/\/ca\/en\/milk$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  // Saving it never touches a shared page.
  const shared = await page.request.get("/ca/en/milk", { maxRedirects: 0 });
  expect(shared.headers()["set-cookie"]).toBeUndefined();
});

test("a country with one language shows no switcher", async ({ page }) => {
  await page.goto("/us/en/milk");
  await expect(page.getByLabel(/^Language:/)).toHaveCount(0);
});

test("the browser's language is offered once, without moving the page", async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: "fr-CA" });
  const page = await context.newPage();
  await page.goto("/ca/en/milk");
  const prompt = page.getByRole("complementary", { name: "Language" });
  await expect(prompt.getByRole("link", { name: "Français" })).toBeVisible();
  await expect(page).toHaveURL(/\/ca\/en\/milk$/);
  await prompt.getByRole("button", { name: "Not now" }).click();
  await page.reload();
  await expect(prompt).toHaveCount(0);
  await context.close();
});
