import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { isPhone } from "./site";
import { createBrowserSession } from "./session-fixture";
import { withLocalDb } from "./local-db";

test("unrated scores have a deliberate empty state and show people only after an answer", async ({
  page,
  context,
}) => {
  test.skip(!!process.env.TEST_BASE_URL, "Rating submissions are local only.");
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/us/products/beyond-burger?food=beef-burgers");
    const metrics = page.locator(".va-score-card__metric");
    await expect(metrics.nth(0).locator(".va-score-card__unrated")).toHaveText(
      "— Unrated",
    );
    await expect(metrics.nth(1).locator(".va-score-card__unrated")).toHaveText(
      "— Unrated",
    );
    await expect(page.locator(".va-score-card")).not.toContainText("0 people");
    await expect(page.locator(".va-score-card__text")).toHaveCount(0);
    await page
      .locator(".va-rate__tasty")
      .getByRole("button", { name: /^5 / })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved" }),
    ).toBeVisible();
    await page.reload();
    await expect(
      metrics.nth(0).locator(".va-score-card__unrated"),
    ).toBeVisible();
    await expect(metrics.nth(1).locator(".va-score-card__text")).toContainText(
      "1 person",
    );
    await expect(metrics.nth(1).locator(".va-score-card__unrated")).toHaveCount(
      0,
    );
    await accessible(page);
  } finally {
    await page.close();
    await session.dispose();
  }
});

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
  await expect(
    page.getByRole("navigation", { name: "Product sections" }),
  ).toHaveCount(0);
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
  for (const group of await editor
    .locator(".va-rate__scores > fieldset")
    .all()) {
    const legend = (await group.locator("legend").boundingBox())!;
    const buttons = (await group
      .locator(".va-numbered-scale__buttons")
      .boundingBox())!;
    expect(buttons.y - legend.y - legend.height).toBeLessThanOrEqual(8);
  }
  const stores = (await page
    .locator(".va-store-toggles > p")
    .first()
    .boundingBox())!;
  const elsewhere = (await page
    .getByRole("link", { name: "Seen it elsewhere? Add or confirm a retailer" })
    .boundingBox())!;
  expect(elsewhere.y).toBeGreaterThanOrEqual(stores.y + stores.height);
  await expect(
    page.getByRole("link", { name: "Report front photo", exact: true }),
  ).toHaveCount(0);
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

test("the retailer contribution link sits below the store chips", async ({
  page,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Fictional store fixtures are local only.",
  );
  const retailer = crypto.randomUUID();
  await withLocalDb(async (db) => {
    await db
      .prepare(
        "INSERT INTO retailers(id,canonical_name,normalized_name,slug,created_at,updated_at) VALUES(?,'Browser fixture store',?,?,1,1)",
      )
      .bind(retailer, retailer, retailer)
      .run();
    await db
      .prepare(
        "INSERT INTO retailer_markets(retailer_id,country_id,is_active,created_at,updated_at) SELECT ?,id,1,1,1 FROM countries WHERE iso2='US'",
      )
      .bind(retailer)
      .run();
    await db
      .prepare(
        "INSERT INTO product_retailers(product_id,retailer_id,status,created_at,updated_at) SELECT id,?,'active',1,1 FROM products WHERE slug='oatly-full-fat'",
      )
      .bind(retailer)
      .run();
  });
  try {
    await page.goto("/us/products/oatly-full-fat?food=milk");
    const stores = (await page
      .locator(".va-store-toggles .va-chip-row")
      .boundingBox())!;
    const link = (await page
      .getByRole("link", {
        name: "Seen it elsewhere? Add or confirm a retailer",
      })
      .boundingBox())!;
    expect(link.y).toBeGreaterThanOrEqual(stores.y + stores.height);
  } finally {
    await page.close();
    await withLocalDb(async (db) => {
      await db.prepare("DELETE FROM retailers WHERE id=?").bind(retailer).run();
    });
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
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Report product", exact: true }),
    ).toHaveCount(1);
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
