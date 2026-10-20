import { expect, test } from "./fixtures";
import { prepareBrowseFixture, removeBrowseFixture } from "./browse-fixture";
import { appendControl, settleResultLayout } from "./append-control";
import { accessible } from "./a11y";

test.beforeAll(async () => {
  if (!process.env.TEST_BASE_URL) await prepareBrowseFixture();
});
test.afterAll(async () => {
  if (!process.env.TEST_BASE_URL) await removeBrowseFixture();
});
test.beforeEach(() =>
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Fictional large fixtures belong only in the local harness.",
  ),
);

const ranking = "/us/browse-batches";
const search = "/us/search?q=appendfixture";

test("appends independent sections, retries safely, and restores batches on Back", async ({
  page,
}) => {
  await page.goto(ranking);
  const rows = page.locator(".va-rank-list > li");
  await expect(rows).toHaveCount(20);
  const disclosure = rows.first().locator("details.va-flavors");
  expect(await rows.first().ariaSnapshot()).not.toContain("Berry");
  await disclosure.locator("summary").click();
  await rows.first().evaluate((element) => {
    (window as unknown as { firstRow: Element }).firstRow = element;
  });
  let requests = 0;
  await page.route("**/api/v1/categories/browse-batches?**", async (route) => {
    requests++;
    if (requests === 1)
      await route.fulfill({ status: 503, body: "temporary failure" });
    else {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.continue();
    }
  });
  const more = page.getByRole("link", { name: "See more ranked results" });
  await appendControl(more);
  await expect(
    page.getByRole("link", { name: "Retry ranked results" }),
  ).toBeVisible();
  await expect(rows).toHaveCount(20);
  await appendControl(page.getByRole("link", { name: "Retry ranked results" }));
  await expect(rows).toHaveCount(40);
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(rows.nth(20)).toBeFocused();
  expect(
    await rows
      .first()
      .evaluate(
        (element) =>
          (window as unknown as { firstRow: Element }).firstRow === element,
      ),
  ).toBe(true);
  await more.scrollIntoViewIfNeeded();
  // Let skipped offscreen rows render at the new scroll position before
  // measuring append stability; programmatic jumps initially use estimates.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const y = (await rows.nth(39).boundingBox())!.y;
  // Two clicks in the same event turn cannot issue duplicate requests.
  await more.evaluate((element) => {
    (element as HTMLElement).click();
    (element as HTMLElement).click();
  });
  await expect(rows).toHaveCount(60);
  expect(requests).toBe(3);
  expect(Math.abs((await rows.nth(39).boundingBox())!.y - y)).toBeLessThan(3);
  expect(
    new Set(
      await rows.evaluateAll((elements) =>
        elements.map((e) => e.getAttribute("data-result")),
      ),
    ).size,
  ).toBe(60);
  await appendControl(
    page.getByRole("link", { name: "See more unrated products" }),
  );
  await expect(page.locator(".va-unrated-list > li")).toHaveCount(40);
  await expect(rows).toHaveCount(60);
  const target = rows.nth(42).getByRole("link").first();
  await target.click();
  await expect(page).toHaveURL(/\/us\/products\/browse-product-/);
  await page.goBack();
  await expect(rows).toHaveCount(60);
  await expect(page.locator(".va-unrated-list > li")).toHaveCount(40);
  await expect(target).toBeInViewport();
  await expect(disclosure).toHaveAttribute("open", "");
  expect(requests).toBe(4);
  // A hard reload starts with just the server batch.
  await page.reload();
  await expect(rows).toHaveCount(20);
});

test("keeps the visible card steady when another section appends above it", async ({
  page,
}) => {
  await page.goto(search);
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/search?**", async (route) => {
    await pending;
    await route.continue();
  });
  try {
    await appendControl(page.getByRole("link", { name: "See more foods" }));
    const visible = page
      .getByRole("region", { name: "Products", exact: true })
      .locator(".va-result")
      .first();
    await settleResultLayout(visible);
    const top = (await visible.boundingBox())!.y;
    release();
    await expect(
      page
        .getByRole("region", { name: "Foods", exact: true })
        .locator(".va-result"),
    ).toHaveCount(24);
    await expect
      .poll(async () => Math.abs((await visible.boundingBox())!.y - top))
      .toBeLessThan(3);
  } finally {
    release();
  }
});

test("search controls are independent and all three sections exhaust", async ({
  page,
}) => {
  await page.goto(search);
  const foods = page.getByRole("region", { name: "Foods", exact: true });
  const brands = page.getByRole("region", { name: "Brands", exact: true });
  const products = page.getByRole("region", { name: "Products", exact: true });
  await expect(foods.locator(".va-result")).toHaveCount(12);
  await expect(brands.locator(".va-result")).toHaveCount(10);
  await expect(products.locator(".va-result")).toHaveCount(20);
  await appendControl(foods.getByRole("link", { name: "See more foods" }));
  await expect(foods.locator(".va-result")).toHaveCount(24);
  await expect(brands.locator(".va-result")).toHaveCount(10);
  await appendControl(brands.getByRole("link", { name: "See more brands" }));
  await expect(brands.locator(".va-result")).toHaveCount(20);
  await appendControl(foods.getByRole("link", { name: "See more foods" }));
  await expect(foods.locator(".va-result")).toHaveCount(27);
  await expect(foods.getByRole("link", { name: "See more foods" })).toHaveCount(
    0,
  );
  await appendControl(brands.getByRole("link", { name: "See more brands" }));
  await expect(brands.locator(".va-result")).toHaveCount(27);
  await expect(
    brands.getByRole("link", { name: "See more brands" }),
  ).toHaveCount(0);
  await appendControl(
    products.getByRole("link", { name: "See more products" }),
  );
  await expect(products.locator(".va-result")).toHaveCount(40);
  await accessible(page);
});

test("keeps hundreds of rows usable and places the qualification divider once", async ({
  page,
}) => {
  await page.goto(ranking + "?view=tastiest");
  const rows = page.locator(".va-rank-list > li");
  const more = page.getByRole("link", { name: "See more ranked results" });
  for (let batch = 2; batch <= 12; batch++) {
    await appendControl(more);
    await expect(rows).toHaveCount(batch * 20);
  }
  await expect(more).toHaveCount(0);
  await expect(page.locator(".va-rank-list__divider")).toHaveCount(1);
  await expect(rows.nth(22)).toContainText(
    "No one has said how tasty these are yet",
  );
  await rows.first().locator("summary").click();
  await expect(rows.first().locator("details")).toHaveAttribute("open", "");
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last()).toContainText("240");
  expect(
    await rows
      .last()
      .evaluate((element) => getComputedStyle(element).contentVisibility),
  ).toBe(
    await page.evaluate(() =>
      CSS.supports("overflow-anchor", "auto") &&
      !CSS.supports("-webkit-hyphens", "none")
        ? "auto"
        : "visible",
    ),
  );
  // Exercise the browser's native text finding across skipped, offscreen rows.
  expect(
    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges();
      return (window as unknown as { find(text: string): boolean }).find(
        "Appendfixture product 002",
      );
    }),
  ).toBe(true);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    "Appendfixture product 002",
  );
});

test("continuation links work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173" + ranking);
    await page.getByRole("link", { name: "See more ranked results" }).click();
    await expect(page).toHaveURL(/section=ranked/);
    await expect(page.locator(".va-rank-list > li")).toHaveCount(20);
    await expect(page.locator(".va-rank-list > li").first()).toContainText(
      "021",
    );
    await page.goto("http://127.0.0.1:5173" + search);
    await page.getByRole("link", { name: "See more products" }).click();
    await expect(page).toHaveURL(/section=products/);
    await expect(
      page
        .getByRole("region", { name: "Products", exact: true })
        .locator(".va-result"),
    ).toHaveCount(20);
  } finally {
    await context.close();
  }
});
