import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";

test("the product overview keeps both scores together and links to a compact editor", async ({
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
    .getByRole("link", { name: "Rate this product", exact: true })
    .click();
  await expect(page).toHaveURL(/\?food=milk#scores-title$/);
  const editor = page.getByRole("region", { name: "Rate it as milk" });
  await expect(editor.locator(".va-rate__product")).toHaveText(
    "Oatmilk Full Fat",
  );
  await expect(
    editor.getByRole("button", {
      name: "3 Fairly close (3 of 5)",
      exact: true,
    }),
  ).toBeEnabled();
  if (!isPhone(page)) {
    expect((await editor.boundingBox())!.height).toBeLessThan(280);
    const overview = await page.locator(".va-product__top").boundingBox();
    const form = await editor.boundingBox();
    expect(form!.y).toBeGreaterThan(overview!.y + overview!.height);
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
    await front.press("ArrowRight");
    await expect(
      gallery.getByRole("radio", { name: "Back", exact: true }),
    ).toBeChecked();
    await expect(gallery.getByText("No back photo yet")).toBeVisible();
    await expect(
      gallery.getByRole("link", { name: "Add this photo" }),
    ).toHaveAttribute("href", /\/contribute\/.+\?action=photo&slot=back$/);
    await gallery
      .getByRole("radio", { name: "Back", exact: true })
      .press("ArrowLeft");
    await expect(front).toBeChecked();
    await expect(
      gallery.getByRole("link", {
        name: "Oatmilk Full Fat: Front",
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
    // axe uses page timers, which are disabled with JavaScript. The hydrated
    // test above audits these same open photo tools in both themes.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});
