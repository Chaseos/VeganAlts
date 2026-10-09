import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";

test("the desktop aisle menu opens from the keyboard, filters by shelf and returns focus", async ({
  page,
}) => {
  test.skip(isPhone(page), "Phones open aisle pages instead of menus.");
  await page.goto("/");
  const aisles = page.getByRole("navigation", { name: "Aisles" });
  const meat = aisles.getByRole("button", { name: "Meat", exact: true });
  await expect(meat).toHaveAttribute("aria-expanded", "false");
  await meat.focus();
  await page.keyboard.press("Enter");
  await expect(meat).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("region", { name: "Meat aisle" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("heading", { name: "Ground Beef" }),
  ).toBeVisible();
  // The top products arrive from the aisle page's cached data.
  await expect(
    menu.getByRole("link", { name: /Beyond Beef/ }).first(),
  ).toBeVisible();
  await accessible(page);

  await menu.getByRole("button", { name: /^Pork/ }).click();
  await expect(menu.getByRole("button", { name: /^Pork/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(menu.getByRole("heading", { name: "Bacon" })).toBeVisible();
  await expect(menu.getByRole("heading", { name: "Ground Beef" })).toHaveCount(
    0,
  );

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(meat).toBeFocused();

  // One menu at a time; an outside click closes it.
  await meat.click();
  await aisles.getByRole("button", { name: "Dairy", exact: true }).click();
  await expect(page.getByRole("region", { name: "Meat aisle" })).toBeHidden();
  await expect(page.getByRole("region", { name: "Dairy aisle" })).toBeVisible();
  // The open menu covers the page, so click the top corner.
  await page.mouse.click(2, 2);
  await expect(page.getByRole("region", { name: "Dairy aisle" })).toBeHidden();

  await meat.click();
  await page
    .getByRole("region", { name: "Meat aisle" })
    .getByRole("link", { name: "See the whole aisle" })
    .click();
  await expect(page).toHaveURL(/\/us\/meat$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Meat" }),
  ).toBeVisible();
});

test("aisle pages render shelves on the server and shelves redirect into their aisle", async ({
  page,
  request,
}) => {
  const shelf = await request.get("/us/beef", { maxRedirects: 0 });
  expect(shelf.status()).toBe(302);
  expect(shelf.headers().location).toBe("/us/meat?shelf=beef");
  const root = await request.get("/us/food", { maxRedirects: 0 });
  expect(root.status()).toBe(302);
  expect(root.headers().location).toBe("/");
  const unknown = await request.get("/us/meat?shelf=nope", { maxRedirects: 0 });
  expect(unknown.status()).toBe(302);
  expect(unknown.headers().location).toBe("/us/meat");

  await page.goto("/us/meat?shelf=pork");
  const shelves = page.getByRole("navigation", { name: "Shelves" });
  await expect(shelves.getByRole("link", { name: /^Pork/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByRole("heading", { name: "Bacon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ground Beef" })).toHaveCount(
    0,
  );
  await shelves.getByRole("link", { name: /^All meat/ }).click();
  await expect(page).toHaveURL(/\/us\/meat$/);
  await expect(
    page.getByRole("heading", { name: "Ground Beef" }),
  ).toBeVisible();
  // The filter box narrows the cards in place.
  await page
    .getByRole("searchbox", { name: "Find a food in Meat" })
    .fill("nug");
  await expect(
    page.getByRole("heading", { name: "Chicken Nuggets" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ground Beef" })).toHaveCount(
    0,
  );
  await accessible(page);

  // A one-shelf aisle has no shelf rail.
  await page.goto("/us/eggs-aisle");
  await expect(page.getByRole("navigation", { name: "Shelves" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: "Eggs", level: 2 }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Suggest a food" }),
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
    const meat = plain
      .getByRole("navigation", { name: "Aisles" })
      .getByRole("link", { name: "Meat" });
    await expect(meat).toHaveAttribute("href", "/us/meat");
    await meat.click();
    await expect(plain).toHaveURL(/\/us\/meat$/);
    await plain
      .getByRole("navigation", { name: "Shelves" })
      .getByRole("link", { name: /^Chicken/ })
      .click();
    await expect(plain).toHaveURL(/\/us\/meat\?shelf=chicken$/);
    await expect(
      plain.getByRole("heading", { name: "Chicken Nuggets" }),
    ).toBeVisible();
  } finally {
    await context.close();
  }

  test.skip(!isPhone(page), "Desktop opens menus once hydrated.");
  await page.goto("/");
  const chips = page.getByRole("navigation", { name: "Aisles" });
  await expect(chips.getByRole("button")).toHaveCount(0);
  await chips.getByRole("link", { name: "Cheese" }).click();
  await expect(page).toHaveURL(/\/us\/cheese$/);
  await page
    .getByRole("navigation", { name: "Shelves" })
    .getByRole("link", { name: /^Soft and spreadable/ })
    .click();
  await expect(page).toHaveURL(/\/us\/cheese\?shelf=soft-and-spreadable$/);
  await expect(
    page.getByRole("heading", { name: "Cream Cheese" }),
  ).toBeVisible();
  await accessible(page);
});
