import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";

test("the desktop aisle menu opens from the keyboard, filters its foods and returns focus", async ({
  page,
}) => {
  test.skip(isPhone(page), "Phones open aisle pages instead of menus.");
  await page.goto("/");
  const aisles = page.getByRole("navigation", { name: "Aisles" });
  const beef = aisles.getByRole("button", { name: "Beef", exact: true });
  await expect(beef).toHaveAttribute("aria-expanded", "false");
  await beef.focus();
  await page.keyboard.press("Enter");
  await expect(beef).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("region", { name: "Beef aisle" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("heading", { name: "Ground Beef" }),
  ).toBeVisible();
  // The top products arrive from the aisle page's cached data.
  await expect(
    menu.getByRole("link", { name: /Beyond Beef/ }).first(),
  ).toBeVisible();
  await accessible(page);

  // Foods sit directly in the aisle; the filter narrows them in place.
  await menu
    .getByRole("searchbox", { name: "Find a food in Beef" })
    .fill("burg");
  await expect(
    menu.getByRole("heading", { name: "Beef Burgers" }),
  ).toBeVisible();
  await expect(menu.getByRole("heading", { name: "Ground Beef" })).toHaveCount(
    0,
  );

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(beef).toBeFocused();

  // One menu at a time; an outside click closes it.
  await beef.click();
  await aisles.getByRole("button", { name: "Cheese", exact: true }).click();
  await expect(page.getByRole("region", { name: "Beef aisle" })).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Cheese aisle" }),
  ).toBeVisible();
  // The open menu covers the page, so click the top corner.
  await page.mouse.click(2, 2);
  await expect(page.getByRole("region", { name: "Cheese aisle" })).toBeHidden();

  // A mouse opens a menu by resting on its aisle and closes it by leaving.
  await aisles.getByRole("button", { name: "Milk", exact: true }).hover();
  await expect(page.getByRole("region", { name: "Milk aisle" })).toBeVisible();
  await page.mouse.move(2, 2);
  await expect(page.getByRole("region", { name: "Milk aisle" })).toBeHidden();

  await beef.click();
  await page
    .getByRole("region", { name: "Beef aisle" })
    .getByRole("link", { name: "See the whole aisle" })
    .click();
  await expect(page).toHaveURL(/\/us\/beef$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Beef" }),
  ).toBeVisible();
});

test("aisle pages list their foods on the server and drop the old shelf parameter", async ({
  page,
  request,
}) => {
  const root = await request.get("/us/food", { maxRedirects: 0 });
  expect(root.status()).toBe(302);
  expect(root.headers().location).toBe("/");
  // An old shelf link still opens its aisle: the public boundary drops the
  // parameter.
  const shelf = await request.get("/us/beef?shelf=pork", { maxRedirects: 0 });
  expect(shelf.status()).toBe(200);

  await page.goto("/us/beef");
  await expect(page.getByRole("navigation", { name: "Shelves" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Ground Beef" }),
  ).toBeVisible();
  // The filter box narrows the cards in place once the page is interactive
  // (on desktop, the aisle bar's links turn into menu buttons then).
  if (!isPhone(page))
    await expect(
      page
        .getByRole("navigation", { name: "Aisles" })
        .getByRole("button", { name: "Beef", exact: true }),
    ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Find a food in Beef" })
    .fill("burg");
  await expect(
    page.getByRole("heading", { name: "Beef Burgers" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ground Beef" })).toHaveCount(
    0,
  );
  await accessible(page);

  // Home aisle cards show three foods, then "See all" (both layouts render).
  await page.goto("/");
  // (On phones the link sits in a closed accordion, so find it by class.)
  await expect(
    page
      .locator(".va-browse__more", { hasText: "See all 8 cheese foods" })
      .first(),
  ).toHaveAttribute("href", "/us/cheese");
  // A seasonal food says when it is sold.
  await page.goto("/us/eggnog");
  await expect(page.getByText("Seasonal · Nov–Jan").first()).toBeVisible();

  // An aisle's Suggest a food link starts in that aisle.
  await page.goto("/us/eggs-aisle");
  await expect(
    page.getByRole("heading", { name: "Eggs", exact: true, level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Eggs for Baking", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Suggest a food" }),
  ).toHaveAttribute("href", "/propose-category?country=us&aisle=eggs-aisle");
  // Crumbs (phones show a back link instead) skip an aisle that only repeats
  // its one food, and name a shared one "Eggs aisle" rather than repeat it.
  await page.goto("/us/butter");
  if (!isPhone(page)) {
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs).not.toContainText("Butter aisle");
    await expect(crumbs.getByRole("link")).toHaveCount(1);
  }
  await page.goto("/us/eggs");
  if (!isPhone(page)) {
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs).toContainText("Eggs aisle");
    await expect(crumbs.getByRole("link")).toHaveCount(2);
  }
  await expect(
    page.getByRole("link", { name: "Suggest a food" }).last(),
  ).toHaveAttribute("href", "/propose-category?country=us");
});

test("without JavaScript and on phones, aisles are links to their pages", async ({
  browser,
  page,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const plain = await context.newPage();
    await plain.goto("/");
    const beef = plain
      .getByRole("navigation", { name: "Aisles" })
      .getByRole("link", { name: "Beef", exact: true });
    await expect(beef).toHaveAttribute("href", "/us/beef");
    await beef.click();
    await expect(plain).toHaveURL(/\/us\/beef$/);
    await expect(
      plain.getByRole("heading", { name: "Beef Burgers" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }

  test.skip(!isPhone(page), "Desktop opens menus once hydrated.");
  await page.goto("/");
  const chips = page.getByRole("navigation", { name: "Aisles" });
  await expect(chips.getByRole("button")).toHaveCount(0);
  await chips.getByRole("link", { name: "Cheese", exact: true }).click();
  await expect(page).toHaveURL(/\/us\/cheese$/);
  await expect(
    page.getByRole("heading", { name: "Cream Cheese" }),
  ).toBeVisible();
  await accessible(page);
});
