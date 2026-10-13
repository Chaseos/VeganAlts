import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";

test("the desktop Foods menu opens from the keyboard, shows each aisle's foods and returns focus", async ({
  page,
}) => {
  test.skip(isPhone(page), "Phones open aisle pages from the aisle chips.");
  // Aisles follow popularity, so the page sets which aisle comes first: the
  // one being viewed.
  await page.goto("/us/beef-burgers");
  const foods = page.getByRole("button", { name: "Foods", exact: true });
  await expect(foods).toHaveAttribute("aria-expanded", "false");
  await foods.focus();
  await page.keyboard.press("Enter");
  await expect(foods).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("region", { name: "Foods" });
  await expect(menu).toBeVisible();
  // Tab reaches the aisle shown, and its foods sit beside the list.
  const aisles = menu.getByRole("list", { name: "Aisles" });
  const beef = aisles.getByRole("link", { name: "Beef", exact: true });
  const names = (await aisles.getByRole("link").allInnerTexts()).map((n) =>
    n.trim(),
  );
  const next = names[(names.indexOf("Beef") + 1) % names.length]!;
  await page.keyboard.press("Tab");
  await expect(beef).toBeFocused();
  await expect(
    menu.getByRole("heading", { name: "Ground Beef" }),
  ).toBeVisible();
  // The top products arrive from the aisle page's cached data.
  await expect(
    menu.getByRole("link", { name: /Beyond Beef/ }).first(),
  ).toBeVisible();
  await accessible(page);

  // The arrow keys move between aisles, showing each one's foods.
  await page.keyboard.press("ArrowDown");
  await expect(
    aisles.getByRole("link", { name: next, exact: true }),
  ).toBeFocused();
  await expect(
    menu.getByRole("heading", { level: 2, name: next, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(beef).toBeFocused();

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
  await expect(foods).toBeFocused();

  // An outside click closes it. The open menu covers the page, so click the
  // top corner.
  await foods.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(menu).toBeHidden();

  // A mouse opens it by resting on Foods, shows the aisle it rests on and
  // closes by leaving.
  await foods.hover();
  await expect(menu).toBeVisible();
  await aisles.getByRole("link", { name: "Cheese", exact: true }).hover();
  await expect(menu.getByRole("heading", { name: "Cheddar" })).toBeVisible();
  await page.mouse.move(2, 2);
  await expect(menu).toBeHidden();

  await foods.click();
  await aisles.getByRole("link", { name: "Cheese", exact: true }).hover();
  await expect(menu.getByRole("heading", { name: "Cheddar" })).toBeVisible();
  await menu.getByRole("link", { name: "See the whole aisle" }).click();
  await expect(page).toHaveURL(/\/us\/cheese$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Cheese" }),
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
  // The filter box narrows the cards in place once the page is interactive.
  // Text typed before hydration can be dropped, so type again until it
  // filters (phones have no other sign of hydration).
  const filter = page.getByRole("searchbox", { name: "Find a food in Beef" });
  await expect(async () => {
    await filter.fill("");
    await filter.fill("burg");
    await expect(
      page.getByRole("heading", { name: "Ground Beef" }),
    ).toHaveCount(0, { timeout: 1000 });
  }).toPass();
  await expect(
    page.getByRole("heading", { name: "Beef Burgers" }),
  ).toBeVisible();
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
  const context = await browser.newContext({
    javaScriptEnabled: false,
    // Desktop: the phone aisle chips are covered below.
    viewport: { width: 1280, height: 800 },
  });
  try {
    const plain = await context.newPage();
    await plain.goto("/");
    // On desktop, Foods links to the page listing every aisle.
    const foods = plain.getByRole("link", { name: "Foods", exact: true });
    await expect(foods).toHaveAttribute("href", "/us/search");
    await foods.click();
    const beef = plain
      .getByRole("main")
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

  test.skip(!isPhone(page), "Desktop opens aisles from the Foods menu.");
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
