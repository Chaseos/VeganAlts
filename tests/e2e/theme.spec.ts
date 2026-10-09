import { expect, test } from "./fixtures";
import { isPhone, openSiteMenu } from "./site";

const LIGHT_GROUND = "rgb(243, 244, 238)";
const DARK_GROUND = "rgb(14, 22, 18)";

const ground = (page: import("./fixtures").Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("System follows the device and a chosen theme applies before first paint", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text()))
      hydrationErrors.push(message.text());
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/about/rankings");
  expect(await ground(page)).toBe(DARK_GROUND);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await ground(page)).toBe(LIGHT_GROUND);

  // Record the theme at the first moment the document is parsed.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { themeAtLoad: string | null }).themeAtLoad =
        document.documentElement.getAttribute("data-theme");
    });
  });

  if (isPhone(page)) {
    const menu = await openSiteMenu(page);
    await menu.getByRole("radio", { name: "Dark" }).check();
    await page.keyboard.press("Escape");
  } else {
    await page.getByLabel("Appearance: System").click();
    await page.getByRole("radio", { name: "Dark" }).check();
  }
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await ground(page)).toBe(DARK_GROUND);

  await page.reload();
  expect(
    await page.evaluate(
      () => (window as unknown as { themeAtLoad: string | null }).themeAtLoad,
    ),
  ).toBe("dark");
  expect(await ground(page)).toBe(DARK_GROUND);
  if (!isPhone(page))
    await expect(page.getByLabel("Appearance: Dark")).toBeVisible();

  await page.evaluate(() => localStorage.removeItem("veganalts.theme.v1"));
  await page.reload();
  expect(await ground(page)).toBe(LIGHT_GROUND);
  expect(hydrationErrors).toEqual([]);
});

test("the font is self-hosted and preloaded", async ({ page }) => {
  await page.goto("/about/privacy");
  const preload = page.locator('link[rel="preload"][as="font"]');
  const href = await preload.getAttribute("href");
  expect(href).toMatch(/archivo-latin-wdth.*\.woff2$/);
  expect((await page.request.get(href!)).status()).toBe(200);
  await expect
    .poll(() => page.evaluate(() => document.fonts.check("16px Archivo")))
    .toBe(true);
});
