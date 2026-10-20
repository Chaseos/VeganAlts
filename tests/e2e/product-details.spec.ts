import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";

test("the product overview groups ratings, collapses their breakdown and keeps notes last", async ({
  page,
}) => {
  await page.goto("/us/products/oatly-full-fat?food=milk");
  const metrics = page.locator(".va-score-card__metric");
  await expect(metrics).toHaveCount(2);
  await expect(metrics.nth(0)).toContainText("Closest");
  await expect(metrics.nth(1)).toContainText("Tastiest");
  await expect(metrics.nth(1).locator(".va-score--tasty")).toBeVisible();
  await expect(page.locator(".va-score-card__flavor")).toContainText(
    "This flavor",
  );
  await page
    .getByRole("navigation", { name: "Product sections" })
    .getByRole("link", { name: "Rate it", exact: true })
    .click();
  await expect(page).toHaveURL(/\?food=milk#scores-title$/);
  const editor = page.getByRole("region", { name: "Rate it as milk" });
  await expect(editor.locator(".va-rate__product")).toHaveText(
    "Oatly Oatmilk Full Fat",
  );
  await expect(
    editor.getByRole("button", {
      name: "3 Fairly close (3 of 5)",
      exact: true,
    }),
  ).toBeEnabled();
  const area = page.getByRole("region", { name: "Ratings", exact: true });
  await expect(
    area.getByRole("heading", { name: "Your rating" }),
  ).toBeVisible();
  const community = await area.locator(".va-score-card").boundingBox();
  const form = await editor.boundingBox();
  expect(form!.y).toBeGreaterThan(community!.y + community!.height);
  expect(
    await editor.evaluate((el) => !!el.closest(".va-product__rating-area")),
  ).toBe(true);
  const breakdown = area.locator(".va-product__rating-details");
  await expect(breakdown).not.toHaveAttribute("open");
  await expect(area.locator(".va-product__breakdown")).not.toBeVisible();
  await breakdown.getByText("How people rated it", { exact: true }).click();
  await expect(area.locator(".va-product__breakdown")).toBeVisible();
  await accessible(page);
  await breakdown.getByText("How people rated it", { exact: true }).click();
  await expect(breakdown).not.toHaveAttribute("open");
  expect(
    await page
      .locator(".va-product__notes")
      .evaluate((el) => el === el.parentElement?.lastElementChild),
  ).toBe(true);
  const history = await page.locator("#formula-history").boundingBox();
  const notes = await page.locator(".va-product__notes").boundingBox();
  expect(notes!.y).toBeGreaterThan(history!.y + history!.height);
  if (!isPhone(page)) {
    const photos = await page.locator(".va-product__photos").boundingBox();
    const panel = await area.boundingBox();
    const alternatives = await page
      .locator(".va-product__alternatives")
      .boundingBox();
    expect(panel!.x).toBeGreaterThan(photos!.x + photos!.width);
    expect(alternatives!.x).toBe(photos!.x);
    expect(alternatives!.y).toBeGreaterThanOrEqual(photos!.y + photos!.height);
    expect(alternatives!.y - photos!.y - photos!.height).toBeLessThanOrEqual(
      24,
    );
  }
  await page.getByText("Add or improve photos", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Product photos" }),
  ).toBeVisible();
  await accessible(page, { extraRules: true });
  if (isPhone(page)) {
    await page.setViewportSize({ width: 320, height: 844 });
    await accessible(page);
  }
});

test.describe("native product photos", () => {
  test.use({ javaScriptEnabled: false });
  test("thumbnails, keyboard selection and photo contribution links work without JavaScript", async ({
    page,
  }) => {
    await page.goto("/us/products/oatly-full-fat?food=milk");
    const gallery = page.getByRole("group", { name: "Package photos" });
    const thumbnail = gallery.locator(".va-gallery__tab--front img");
    const source = await thumbnail.getAttribute("src");
    expect(source).toMatch(/^\/media\/.+\/thumbnail$/);
    await expect
      .poll(() =>
        thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(
      gallery.locator(".va-gallery__slide--front img"),
    ).toHaveAttribute("src", source!.replace("/thumbnail", "/full"));
    const front = gallery.getByRole("radio", { name: "Front", exact: true });
    await expect(front).toBeChecked();
    // This fixture has only its front photo. Missing categories appear only
    // inside Add or improve photos, never as empty gallery selectors.
    await expect(gallery.getByRole("radio")).toHaveCount(1);
    await expect(gallery.locator(".va-gallery__tab")).toHaveCount(1);
    await expect(
      gallery.getByRole("radio", { name: "Back", exact: true }),
    ).toHaveCount(0);
    await front.press("ArrowRight");
    await expect(front).toBeChecked();
    await expect(
      gallery.getByRole("link", {
        name: "Oatly Oatmilk Full Fat: Front",
        exact: true,
      }),
    ).toHaveAttribute("href", source!.replace("/thumbnail", "/full"));
    await expect(gallery.locator(".va-gallery__tab--front")).toHaveCSS(
      "outline-style",
      "solid",
    );
    // The canonical deep link reveals the contribution tools even without hydration.
    await page.goto("/us/products/oatly-full-fat?food=milk#photo-slots");
    await expect(
      page.getByRole("heading", { name: "Product photos" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Suggest a better photo: Front",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Report photo: Front", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add photo: Back", exact: true }),
    ).toBeVisible();
    // axe uses page timers, which are disabled with JavaScript. The hydrated
    // test above audits these same open photo tools in both themes.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
