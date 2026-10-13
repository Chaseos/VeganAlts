import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";
import { isPhone } from "./site";

test("cancelling sign-in leaves protected tasks and retains public product context", async ({
  page,
}) => {
  await page.goto("/add-product?country=gb&food=milk");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  const task = new URL(page.url()).searchParams.get("returnTo")!;
  expect(task).toBe("/add-product?country=gb&food=milk");
  await expect(page.locator('input[name="returnTo"]')).toHaveValue(task);
  await expect(
    page.getByRole("link", { name: "Continue browsing" }),
  ).toHaveAttribute("href", "/gb");
  await page.getByRole("link", { name: "Continue browsing" }).click();
  await expect(page).toHaveURL(/\/gb$/);

  const product = "/us/products/beyond-beef?food=ground-beef#scores-title";
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(product)}`);
  await expect(
    page.getByRole("link", { name: "Continue browsing" }),
  ).toHaveAttribute("href", product);
  await page.getByRole("link", { name: "Continue browsing" }).click();
  await expect(page).toHaveURL(
    new RegExp("/us/products/beyond-beef\\?food=ground-beef#scores-title$"),
  );
  await expect(
    page.getByRole("region", { name: "Rate it as ground beef" }),
  ).toBeVisible();
});

test("a multi-flavor shortcut selects a flavor and resumes its rating after sign-in", async ({
  page,
  context,
  request,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Only local harness accounts write ratings.",
  );
  const session = await createBrowserSession();
  try {
    await page.goto("/us/milk");
    // Test the hydrated keyboard handler; the native fallback is covered below.
    await expect(
      page.getByRole("button", {
        name: isPhone(page) ? "Menu" : "Foods",
        exact: true,
      }),
    ).toBeVisible();
    const featured = page.getByRole("article", { name: "Oatly Oatmilk" });
    const disclosure = featured.locator(".va-flavors");
    await featured
      .getByRole("link", { name: "I’ve tried it", exact: true })
      .press("Enter");
    await expect(page).toHaveURL(/\/us\/milk$/);
    await expect(disclosure).toHaveAttribute("open", "");
    await expect(disclosure.locator("summary")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(disclosure.locator("summary")).toBeFocused();
    await featured
      .getByRole("link", { name: "I’ve tried it", exact: true })
      .click();
    await disclosure
      .getByRole("link", { name: "Rate it: Oatmilk Full Fat", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/us\/products\/oatly-full-fat\?food=milk#scores-title$/,
    );
    const form = page.getByRole("region", { name: "Rate it as milk" });
    await expect(form.locator(".va-rate__product")).toContainText(
      "Oatmilk Full Fat",
    );
    await form
      .getByRole("button", { name: "4 Very close (4 of 5)", exact: true })
      .click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
    expect(returnTo).toMatch(
      /^\/us\/products\/oatly-full-fat\?food=milk#rate-/,
    );
    await context.addCookies([session.cookie]);
    await page.goto(`/auth/return?returnTo=${encodeURIComponent(returnTo)}`);
    await expect(form.getByRole("status")).toContainText("Saved 4/5");
    const saved = await (await page.request.get("/api/v1/me/ratings")).json();
    const target = (
      await (
        await request.get("/api/v1/products/oatly-full-fat?food=milk")
      ).json()
    ).data;
    expect(saved.data).toHaveLength(1);
    expect(saved.data[0].productVersionId).toBe(target.versionId);
    expect(saved.data[0].categoryId).toBe(
      target.categories.find((food: { slug: string }) => food.slug === "milk")
        .id,
    );
    await accessible(page);
  } finally {
    await page.close();
    await session.dispose();
  }
});

test("phone country selection is visible, keyboard accessible and before aisles", async ({
  page,
}) => {
  test.skip(!isPhone(page), "Phone header and sheet.");
  await page.goto("/us/milk");
  const country = page.getByLabel(/^Country: United States/);
  await expect(country).toBeVisible();
  await expect(country).toContainText("US");
  await country.press("Enter");
  await expect(
    page.getByRole("group", { name: "Choose a country" }),
  ).toBeVisible();
  await accessible(page, { extraRules: true });
  await page.keyboard.press("Escape");
  await expect(country).toBeFocused();
  await country.press("Enter");
  await page
    .getByRole("banner")
    .getByRole("link", { name: /^Canada/ })
    .click();
  await expect(page).toHaveURL(/\/ca\/milk$/);
  await expect(page.getByLabel(/^Country: Canada/)).toContainText("CA");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const menu = page.getByRole("dialog", { name: "Site menu" });
  const headings = await menu.getByRole("heading").allTextContents();
  expect(headings.slice(0, 3).map((s) => s.trim())).toEqual([
    "Country",
    "Account",
    "Aisles",
  ]);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Menu", exact: true }),
  ).toBeFocused();
});

test("phone rankings and product scores are visible before scrolling", async ({
  page,
}) => {
  test.skip(!isPhone(page), "390px phone layout.");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/us/milk");
  const score = page.locator(".va-featured .va-score");
  await expect(score).toBeVisible();
  expect(
    (await score.boundingBox())!.y + (await score.boundingBox())!.height,
  ).toBeLessThan(page.viewportSize()!.height);
  await page.goto("/us/products/oatly-full-fat?food=milk");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const primary = page.locator(".va-score-card__metrics .va-score").first();
  await expect(primary).toBeVisible();
  expect(
    (await primary.boundingBox())!.y + (await primary.boundingBox())!.height,
  ).toBeLessThan(page.viewportSize()!.height);
  expect(
    (await page.locator(".va-gallery__stage").boundingBox())!.height,
  ).toBeLessThanOrEqual(220);
  await accessible(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await accessible(page);
});

test.describe("native flavor choice", () => {
  test.use({ javaScriptEnabled: false });
  test("the multi-flavor shortcut reveals the list without JavaScript", async ({
    page,
  }) => {
    await page.goto("/us/milk");
    const featured = page.getByRole("article", { name: "Oatly Oatmilk" });
    await featured
      .getByRole("link", { name: "I’ve tried it", exact: true })
      .click();
    await expect(featured.locator(".va-flavors")).toHaveAttribute("open", "");
    await featured
      .getByRole("link", { name: "Rate it: Oatmilk Full Fat", exact: true })
      .click();
    await expect(page).toHaveURL(
      /\/us\/products\/oatly-full-fat\?food=milk#scores-title$/,
    );
  });
});
