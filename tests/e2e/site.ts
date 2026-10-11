import { expect, type Page } from "./fixtures";

// The header shows account links on desktop; phones reach them through the
// Menu sheet. These helpers hide that difference from journeys.
export const isPhone = (page: Page) =>
  (page.viewportSize()?.width ?? 1280) < 760;

export async function openSiteMenu(page: Page) {
  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.getByRole("dialog", { name: "Site menu" });
  await expect(menu).toBeVisible();
  return menu;
}

export async function closeSiteMenu(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Site menu" })).toBeHidden();
}

export async function expectSignedIn(page: Page) {
  if (isPhone(page)) {
    const menu = await openSiteMenu(page);
    await expect(menu.getByRole("link", { name: "My ratings" })).toBeVisible();
    await closeSiteMenu(page);
  } else await expect(page.getByLabel(/^Account: /)).toBeVisible();
}

export async function signInLink(page: Page) {
  if (isPhone(page))
    return (await openSiteMenu(page)).getByRole("link", { name: "Sign in" });
  return page.getByRole("banner").getByRole("link", { name: "Sign in" });
}

export async function openAccountLink(page: Page, name: string) {
  if (isPhone(page)) {
    await (await openSiteMenu(page)).getByRole("link", { name }).click();
    return;
  }
  await page.getByLabel(/^Account: /).click();
  await page
    .getByRole("navigation", { name: "Account" })
    .getByRole("link", { name })
    .click();
}

export async function chooseCountry(page: Page, name: string) {
  if (isPhone(page)) {
    const menu = await openSiteMenu(page);
    await menu.getByRole("link", { name: new RegExp(`^${name}`) }).click();
    return;
  }
  await page.getByLabel(/^Country: /).click();
  await page
    .getByRole("banner")
    .getByRole("navigation", { name: "Countries" })
    .getByRole("link", { name: new RegExp(`^${name}`) })
    .click();
}

// Add a product, step 1: type a food and choose it from the list.
export async function chooseFood(page: Page, food: string) {
  await page
    .getByRole("combobox", { name: "What food does it replace? (required)" })
    .fill(food);
  await page
    .getByRole("option", { name: new RegExp(food, "i") })
    .first()
    .click();
}

export async function fillBasics(
  page: Page,
  {
    food,
    brand,
    name,
    photo = "tests/fixtures/small.jpg",
  }: { food: string; brand: string; name: string; photo?: string },
) {
  await chooseFood(page, food);
  await page.getByLabel("Brand (required)", { exact: true }).fill(brand);
  await page.getByLabel("Product name (required)", { exact: true }).fill(name);
  await page.getByLabel("Front of pack photo (required)").setInputFiles(photo);
}

// Opens an optional row of step 2 by its title.
export async function openOptional(page: Page, title: string) {
  const row = page.locator("details.va-optional", {
    has: page.locator(".va-optional__title", { hasText: title }),
  });
  if (!(await row.evaluate((el) => (el as HTMLDetailsElement).open)))
    await row.locator("summary").click();
  return row;
}
