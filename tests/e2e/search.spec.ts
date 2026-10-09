import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";

test("instant answers work from the keyboard and announce their count", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.getByRole("combobox", { name: "Search a food or brand" });
  // One letter is not enough to ask.
  await field.fill("b");
  await expect(field).toHaveAttribute("aria-expanded", "false");
  await field.fill("beef");
  const list = page.getByRole("listbox", { name: "Suggestions for beef" });
  await expect(list).toBeVisible();
  await expect(field).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".va-instant__live")).toHaveText(
    /foods? and \d+ products? found/,
  );
  const foods = list.getByRole("group", { name: "Foods · closest swap shown" });
  await expect(foods.getByRole("option").first()).toContainText("Beef Burgers");
  await expect(
    list.getByRole("group", { name: "Products" }).getByRole("option").first(),
  ).toBeVisible();
  // The desktop home previews the first food's top swaps.
  if (!isPhone(page))
    await expect(
      page.getByRole("region", { name: /^Top swaps for / }),
    ).toBeVisible();
  await accessible(page);

  await field.press("ArrowDown");
  await expect(field).toHaveAttribute(
    "aria-activedescendant",
    (await foods.getByRole("option").first().getAttribute("id"))!,
  );
  await expect(foods.getByRole("option").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await field.press("ArrowDown");
  await expect(foods.getByRole("option").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // Escape closes the list, a second Escape clears the field.
  await field.press("Escape");
  await expect(list).toBeHidden();
  await field.press("Escape");
  await expect(field).toHaveValue("");

  await field.fill("ground");
  await expect(
    page.getByRole("listbox", { name: "Suggestions for ground" }),
  ).toBeVisible();
  await field.press("ArrowDown");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/us\/ground-beef$/);
});

test("a food that is not here yet can be suggested from the answers", async ({
  page,
}) => {
  await page.goto("/");
  const field = page.getByRole("combobox", { name: "Search a food or brand" });
  await field.fill("zzqx");
  await expect(page.getByText("No foods match “zzqx” yet")).toBeVisible();
  await page
    .getByRole("link", { name: "Can’t find a food? Suggest it" })
    .click();
  // Suggesting needs an account; sign-in returns to the prefilled page.
  await expect(page).toHaveURL(
    /\/sign-in\?returnTo=%2Fpropose-category%3Fcountry%3Dus%26name%3Dzzqx$/,
  );
});

test("the header searches from any desktop page and search works without JavaScript", async ({
  browser,
  page,
}) => {
  if (!isPhone(page)) {
    await page.goto("/us/meat");
    const header = page
      .getByRole("banner")
      .getByRole("combobox", { name: "Search a food or brand" });
    await header.fill("cheddar");
    const option = page
      .getByRole("listbox", { name: "Suggestions for cheddar" })
      .getByRole("option", { name: /Cheddar/ })
      .first();
    await option.click();
    await expect(page).toHaveURL(/\/us\/cheddar$/);
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const plain = await context.newPage();
    await plain.goto("/");
    await plain
      .getByRole("searchbox", { name: "Search a food or brand" })
      .fill("milk");
    await plain.getByRole("button", { name: "Find swaps" }).click();
    await expect(plain).toHaveURL(/\/us\/search\?q=milk$/);
    await expect(
      plain.getByRole("heading", { level: 1, name: "Results for “milk”" }),
    ).toBeVisible();
    await expect(
      plain.getByRole("heading", { name: "Milk", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
  }
  await page.goto("/us/search?q=milk");
  await accessible(page);
});

test("instant answers are shared-cached and limited to five of each", async ({
  request,
}) => {
  const answer = await request.get("/api/v1/suggest?country=us&q=be");
  expect(answer.status()).toBe(200);
  expect(answer.headers()["set-cookie"]).toBeUndefined();
  const { data } = await answer.json();
  expect(data.foods.length).toBeLessThanOrEqual(5);
  expect(data.products.length).toBeLessThanOrEqual(5);
  const short = await (
    await request.get("/api/v1/suggest?country=us&q=b")
  ).json();
  expect(short.data).toMatchObject({ foods: [], products: [] });
});
