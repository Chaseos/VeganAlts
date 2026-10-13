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
  // The sort menu holds the ranking, Trending and Newest; the toggle above
  // it switches between the two rankings.
  const sortBy = async (current: string, next: RegExp) => {
    await page.getByLabel(`Sort: ${current}`).click();
    await page
      .getByRole("group", { name: "Sort by" })
      .getByRole("link", { name: next })
      .click();
  };
  await expect(page.getByLabel("Sort: Ranking")).toBeVisible();
  await sortBy("Ranking", /^Trending/);
  await expect(page).toHaveURL(/view=trending/);
  await expect(page.getByLabel("Sort: Trending")).toBeVisible();
  await expect(page.getByText("It never changes a ranking.")).toBeVisible();
  await accessible(page);
  await sortBy("Trending", /^Newest/);
  await expect(page).toHaveURL(/view=new/);
  await expect(page.getByText(/^Added in the last \d+ days/)).toBeVisible();
  await expect(page.locator("link[rel=canonical]")).toHaveAttribute(
    "href",
    /\/us\/ground-beef\?view=new$/,
  );
  await sortBy("Newest", /^Ranking/);
  await expect(page.locator(".va-featured")).toContainText("#1 swap");
  // Tastiest is the second ranking; Closest to the original stays the default.
  const rankings = page.getByRole("navigation", { name: "Ranking" });
  await expect(
    rankings.getByRole("link", { name: "Closest to the original" }),
  ).toHaveAttribute("aria-current", "page");
  await rankings.getByRole("link", { name: "Tastiest" }).click();
  await expect(page).toHaveURL(/view=tastiest/);
  await expect(
    rankings.getByRole("link", { name: "Tastiest" }),
  ).toHaveAttribute("aria-current", "page");
  await accessible(page);
});
