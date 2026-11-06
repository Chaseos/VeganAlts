import { expect, test } from "./fixtures";
import { accessible } from "./a11y";

test("Japan reads in Japanese, and in English at its own address", async ({
  page,
}) => {
  await page.goto("/jp");
  await expect(page).toHaveURL(/\/jp\/ja$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("banner")).toContainText("日本");
  await accessible(page);
  await page.goto("/jp/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await accessible(page);
});

test("a Japanese search of one character reaches the results page", async ({
  page,
}) => {
  await page.goto("/jp/ja/search?q=%E5%8D%B5");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("卵");
  await expect(page.getByRole("main")).not.toContainText("3");
  await accessible(page);
});

test("the Japanese dictionary loads before hydration", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto("/jp/ja");
  await page.waitForLoadState("networkidle");
  expect(errors).toEqual([]);
});
