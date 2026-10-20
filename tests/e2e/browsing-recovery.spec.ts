import { expect, test } from "./fixtures";
import { prepareBrowseFixture, removeBrowseFixture } from "./browse-fixture";
import { appendControl } from "./append-control";
import { accessible } from "./a11y";
import { withLocalDb } from "./local-db";

test.beforeAll(async () => {
  if (!process.env.TEST_BASE_URL) await prepareBrowseFixture();
});
test.afterAll(async () => {
  if (!process.env.TEST_BASE_URL) await removeBrowseFixture();
});
test.beforeEach(() =>
  test.skip(Boolean(process.env.TEST_BASE_URL), "Local browser fixtures only."),
);

test("Back restores a consistent ranking snapshot after standings change", async ({
  page,
}) => {
  for (const view of ["top", "tastiest"]) {
    await prepareBrowseFixture();
    try {
      await page.goto(`/us/browse-batches?view=${view}`);
      const rows = page.locator(".va-rank-list > li");
      await expect(rows).toHaveCount(20);
      const summary = await page.locator(".va-ranking__summary").innerText();
      const disclosure = rows.first().locator("details.va-flavors");
      await disclosure.locator("summary").click();
      await appendControl(
        page.getByRole("link", { name: "See more ranked results" }),
      );
      await expect(rows).toHaveCount(40);
      const openProduct = async () => {
        await page.locator(".va-featured__name a").click();
        await expect(page).toHaveURL(/\/products\/browse-product-1/);
      };
      await openProduct();
      await withLocalDb((db) =>
        db
          .prepare(
            "UPDATE family_category_stats SET bayesian_score=5,enjoyment_score=5 WHERE product_family_id='browse-line-2'",
          )
          .run(),
      );
      const changed = await page.request.get(
        `/api/v1/categories/browse-batches?country=us&view=${view}&section=ranked`,
      );
      expect((await changed.json()).data.items[0].lineId).toBe("browse-line-2");
      await page.goBack();
      await expect(rows).toHaveCount(40);
      await expect(rows.first()).toHaveAttribute(
        "data-result",
        "browse-line-1",
      );
      await expect(rows.first().locator(".va-featured")).toHaveCount(1);
      await expect(page.locator(".va-featured")).toHaveCount(1);
      await expect(rows.nth(1)).toContainText("Rank #2");
      await expect(page.locator(".va-featured")).not.toContainText(
        "#2 overall",
      );
      await expect(page.locator(".va-ranking__summary")).toHaveText(summary);
      await expect(disclosure).toHaveAttribute("open", "");
      // An empty fresh response must not hide the cached list or contradict
      // its summary. Reload remains the way to start a fresh snapshot.
      await openProduct();
      await withLocalDb((db) =>
        db
          .prepare(
            "UPDATE family_category_stats SET people_count=0,mean_sum=0,raw_average=NULL,bayesian_score=NULL,enjoyment_people=0,enjoyment_mean_sum=0,enjoyment_score=NULL WHERE category_id='browse-food'",
          )
          .run(),
      );
      await page.goBack();
      await expect(rows).toHaveCount(40);
      await expect(page.locator(".va-ranking__summary")).toHaveText(summary);
      await page.reload();
      await expect(rows).toHaveCount(0);
      await expect(page.locator(".va-ranking__summary")).not.toHaveText(
        summary,
      );
    } finally {
      await prepareBrowseFixture();
    }
  }
});

test("brand candidate limits remain visible after append and when candidates do not match", async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|hydrated/i.test(message.text())
    )
      hydrationErrors.push(message.text());
  });
  const series =
    "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<210)";
  await withLocalDb(async (db) => {
    const country = await db
      .prepare("SELECT id FROM countries WHERE iso2='US'")
      .first<{ id: string }>();
    if (!country) throw new Error("Prepare the demo browser catalog first.");
    await db.batch([
      db.prepare(
        `INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) ${series} SELECT 'browse-brand-limit-'||i,'Qzx'||printf('%03d',i),'qzx'||printf('%03d',i),'browse-brand-limit-'||i,1,1 FROM n`,
      ),
      db
        .prepare(
          `INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at) ${series} SELECT 'browse-line-limit-'||i,'browse-brand-limit-'||i,?,'Brand search fixture '||i,'browse-line-limit-'||i,1,1 FROM n`,
        )
        .bind(country.id),
      db
        .prepare(
          `INSERT INTO products(id,country_id,brand_id,product_family_id,name,slug,created_at,updated_at) ${series} SELECT 'browse-product-limit-'||i,?,'browse-brand-limit-'||i,'browse-line-limit-'||i,'Brand search fixture '||i,'browse-product-limit-'||i,1,1 FROM n`,
        )
        .bind(country.id),
    ]);
  });
  try {
    // Follow the real cursors to the penultimate server batch, then append
    // the last batch through its public control.
    let cursor = "";
    for (let i = 0; i < 18; i++) {
      const response = await page.request.get(
        `/api/v1/search?country=us&q=qzx&section=brands${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      expect(response.ok()).toBe(true);
      cursor = (await response.json()).data.nextCursor;
      expect(cursor).toBeTruthy();
    }
    await page.goto(
      `/us/search?q=qzx&section=brands&cursor=${encodeURIComponent(cursor)}`,
    );
    const brands = page.getByRole("region", { name: "Brands", exact: true });
    await expect(brands.locator(".va-result")).toHaveCount(10);
    await appendControl(page.getByRole("link", { name: "See more brands" }));
    await expect(brands.locator(".va-result")).toHaveCount(20);
    await expect(
      brands.getByText("You’ve reached the browsing limit.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "See more brands" }),
    ).toHaveCount(0);

    // A truncated candidate set with no final matches still needs the notice,
    // including in the server-rendered HTML used without JavaScript.
    const document = await page.goto("/us/search?q=qzxt");
    expect(await document!.text()).toContain(
      "You’ve reached the browsing limit.",
    );
    await expect(brands.locator(".va-result")).toHaveCount(0);
    await expect(
      brands.getByText("You’ve reached the browsing limit.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /No foods, brands or products match/ }),
    ).toHaveCount(0);
    expect(hydrationErrors).toEqual([]);
  } finally {
    await withLocalDb((db) =>
      db.batch([
        db.prepare(
          "DELETE FROM products WHERE id LIKE 'browse-product-limit-%'",
        ),
        db.prepare(
          "DELETE FROM product_families WHERE id LIKE 'browse-line-limit-%'",
        ),
        db.prepare("DELETE FROM brands WHERE id LIKE 'browse-brand-limit-%'"),
      ]),
    );
  }
});

test("ignores superseded batches, resets on view changes, and announces the browsing limit", async ({
  page,
}) => {
  await page.goto("/us/browse-batches");
  let started = false;
  await page.route("**/api/v1/categories/browse-batches?**", async (route) => {
    started = true;
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue().catch(() => {});
  });
  await appendControl(
    page.getByRole("link", { name: "See more ranked results" }),
  );
  await expect.poll(() => started).toBe(true);
  const view = page.getByRole("link", { name: "Tastiest", exact: true });
  await view.focus();
  await view.press("Enter");
  await expect(page).toHaveURL(/view=tastiest/);
  await expect(
    page.getByRole("link", { name: "Tastiest", exact: true }),
  ).toBeFocused();
  await page.waitForTimeout(800); // The deliberately late response has now arrived.
  await expect(page.locator(".va-rank-list > li")).toHaveCount(20);
  await page.unroute("**/api/v1/categories/browse-batches?**");
  await page.route("**/api/v1/categories/browse-batches?**", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    value.data.nextCursor = null;
    value.data.limitReached = true;
    await route.fulfill({ response, json: value });
  });
  await appendControl(
    page.getByRole("link", { name: "See more ranked results" }),
  );
  await expect(page.locator(".va-rank-list > li")).toHaveCount(40);
  await expect(
    page.getByText("You’ve reached the browsing limit.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "See more ranked results" }),
  ).toHaveCount(0);
});

test("evicted Back contexts use the server batch without replaying requests", async ({
  page,
}) => {
  await page.goto("/us/search?q=appendfixture");
  let requests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/search") requests++;
  });
  await appendControl(page.getByRole("link", { name: "See more products" }));
  await expect(
    page
      .getByRole("region", { name: "Products", exact: true })
      .locator(".va-result"),
  ).toHaveCount(40);
  for (const query of ["cheddar", "milk", "beef"]) {
    await page.locator("#page-search").fill(query);
    await page.locator("#page-search").press("Enter");
    await expect(page).toHaveURL(new RegExp(`q=${query}$`));
  }
  for (const query of ["milk", "cheddar", "appendfixture"]) {
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`q=${query}$`));
  }
  await expect(
    page
      .getByRole("region", { name: "Products", exact: true })
      .locator(".va-result"),
  ).toHaveCount(20);
  expect(requests).toBe(1);
});

test("photo retries, thumbnail fallbacks, reduced motion and narrow layouts remain usable", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.route("**/media/*/thumbnail", (route) => route.abort());
  await page.goto("/us/milk");
  await expect(page.locator(".va-thumb--empty").first()).toBeVisible();
  await page.route("**/media/*/full", (route) => route.abort());
  await page.goto("/us/products/oatly-full-fat?food=milk");
  const photoLink = page
    .getByRole("group", { name: "Package photos" })
    .getByRole("link");
  // The server link deliberately opens the image before hydration. Wait for
  // its dialog enhancement when exercising the viewer's recovery behavior.
  await expect(photoLink).toHaveAttribute("aria-haspopup", "dialog");
  await photoLink.click();
  const viewer = page.getByRole("dialog", { name: /photos/ });
  await expect(
    viewer.getByRole("button", { name: "Retry photo" }),
  ).toBeVisible();
  await page.unroute("**/media/*/full");
  await viewer.getByRole("button", { name: "Retry photo" }).click();
  await expect
    .poll(() =>
      viewer
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await viewer.getByRole("button", { name: "Close full-size photos" }).click();
  await page.setViewportSize({ width: 320, height: 720 });
  await accessible(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/us/search?q=appendfixture");
  await appendControl(page.getByRole("link", { name: "See more brands" }));
  expect(
    await page
      .locator("main")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
});
