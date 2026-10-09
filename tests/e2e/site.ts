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
