import { expect, test } from "./fixtures";
import { prepareBrowseFixture, removeBrowseFixture } from "./browse-fixture";
import { appendControl } from "./append-control";
import { accessible } from "./a11y";

test.beforeAll(async () => {
  if (!process.env.TEST_BASE_URL) await prepareBrowseFixture();
});
test.afterAll(async () => {
  if (!process.env.TEST_BASE_URL) await removeBrowseFixture();
});
test.beforeEach(() =>
  test.skip(Boolean(process.env.TEST_BASE_URL), "Local browser fixtures only."),
);

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
