import { expect, test } from "./fixtures";
import { accessible } from "./a11y";

test("categories offer separate Top, Trending and New views and the homepage surfaces discovery", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Browse every food",
    "Trending now",
    "New and needs ratings",
  ])
    await expect(page.getByRole("heading", { name })).toBeVisible();
  await accessible(page);
  await page.goto("/us/ground-beef");
  // One sort menu holds Closest match (Top), Trending and Newest.
  const sortBy = async (current: string, next: RegExp) => {
    await page.getByLabel(`Sort: ${current}`).click();
    await page
      .getByRole("group", { name: "Sort by" })
      .getByRole("link", { name: next })
      .click();
  };
  await expect(page.getByLabel("Sort: Closest match")).toBeVisible();
  await sortBy("Closest match", /^Trending/);
  await expect(page).toHaveURL(/view=trending/);
  await expect(
    page.getByRole("heading", { name: "Trending alternatives" }),
  ).toBeVisible();
  await expect(
    page.getByText("It never changes the Top ranking."),
  ).toBeVisible();
  await accessible(page);
  await sortBy("Trending", /^Newest/);
  await expect(page).toHaveURL(/view=new/);
  await expect(
    page.getByRole("heading", { name: "New alternatives" }),
  ).toBeVisible();
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    /\/us\/ground-beef\?view=new$/,
  );
  await sortBy("Newest", /^Closest match/);
  await expect(
    page.getByRole("heading", { name: /Top alternatives/ }),
  ).toBeVisible();
});
