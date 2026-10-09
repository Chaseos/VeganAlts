import { expect, test, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("categories offer separate Top, Trending and New views and the homepage surfaces discovery", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What’s on your plate?" }),
  ).toBeVisible();
  await accessible(page);
  await page.goto("/us/ground-beef");
  const tabs = page.getByRole("navigation", { name: "Ranking view" });
  await expect(tabs.getByRole("link", { name: "Top" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await tabs.getByRole("link", { name: "Trending" }).click();
  await expect(page).toHaveURL(/view=trending/);
  await expect(
    page.getByRole("heading", { name: "Trending alternatives" }),
  ).toBeVisible();
  await expect(
    page.getByText("It never changes the Top ranking."),
  ).toBeVisible();
  await accessible(page);
  await tabs.getByRole("link", { name: "New" }).click();
  await expect(page).toHaveURL(/view=new/);
  await expect(
    page.getByRole("heading", { name: "New alternatives" }),
  ).toBeVisible();
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    /\/us\/ground-beef\?view=new$/,
  );
  await tabs.getByRole("link", { name: "Top" }).click();
  await expect(
    page.getByRole("heading", { name: /Top alternatives/ }),
  ).toBeVisible();
});
