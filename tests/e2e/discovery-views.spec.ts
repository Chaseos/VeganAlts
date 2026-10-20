import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";

test("categories offer separate Top, Trending and New views and the homepage surfaces discovery", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of [
    "Popular aisles",
    "Trending now",
    "New and needs ratings",
  ])
    await expect(
      page.getByRole("main").getByRole("heading", { name }),
    ).toBeVisible();
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

test("home and footer show the same popular aisles and retain the complete directory", async ({
  page,
}) => {
  await page.goto("/");
  const cards = page.locator(
    isPhone(page) ? ".va-browse--phone > li" : ".va-browse--desktop > li",
  );
  await expect(cards).toHaveCount(6);
  const homeNames = await cards.locator(".va-browse__name").allTextContents();
  const footer = page.locator(".va-footer__group").filter({
    has: page.getByRole("heading", { name: "Popular aisles" }),
  });
  const links = footer.getByRole("link");
  await expect(links).toHaveCount(7);
  expect((await links.allTextContents()).slice(0, 6)).toEqual(homeNames);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Browse all aisles" })
    .click();
  await expect(page).toHaveURL(/\/us\/search$/);
  await expect
    .poll(() => page.locator(".va-search-page__aisles > li").count())
    .toBeGreaterThan(6);
});

test("product lists show branded titles and loaded package thumbnails on every screen size", async ({
  page,
}) => {
  for (const [path, selector, minimum] of [
    ["/us/milk", ".va-featured img.va-thumb", isPhone(page) ? 128 : 200],
    ["/us/milk", ".va-rank-row img.va-thumb", 88],
    ["/us/bacon", ".va-unrated img.va-thumb", 88],
    ["/us/search?q=milk", ".va-search-page__products img.va-thumb", 88],
    ["/us/brand/oatly", ".va-brand__line img.va-thumb", 88],
  ] as const) {
    await page.goto(path);
    const photo = page.locator(selector).first();
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute("src", /^\/media\/.+\/thumbnail$/);
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    expect((await photo.boundingBox())!.width).toBeGreaterThanOrEqual(minimum);
  }
  await page.goto("/us/products/oatly-full-fat");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Oatly Oatmilk Full Fat",
  );
  await page.goto("/us/products/beyond-beef");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Beyond Beef",
  );
  await page.goto("/us/milk");
  await accessible(page);
  if (isPhone(page)) {
    await page.setViewportSize({ width: 320, height: 844 });
    await accessible(page);
  }
});
