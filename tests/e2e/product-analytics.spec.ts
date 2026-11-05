import { expect, test } from "./fixtures";
import { createBrowserSession } from "./session-fixture";

test("a product view reaches the private analytics page", async ({
  page,
  context,
}) => {
  test.skip(!!process.env.TEST_BASE_URL, "Local test-harness session.");
  const recorded = page.waitForResponse(
    (response) =>
      /\/api\/v1\/products\/[^/]+\/views$/.test(response.url()) &&
      response.request().method() === "POST",
  );
  await page.goto("/us/products/beyond-burger");
  expect((await recorded).status()).toBe(200);

  await page.goto("/admin/analytics?q=Beyond+Burger");
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fadmin%2Fanalytics/);

  const session = await createBrowserSession({ administrator: true });
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/admin/analytics?q=Beyond+Burger");
    const row = page.getByRole("row", { name: /Beyond Burger/ });
    await expect(row).toBeVisible();
    const views = Number(await row.getByRole("cell").first().innerText());
    expect(views).toBeGreaterThan(0);
    await page.getByRole("link", { name: "Most saved" }).click();
    await expect(page).toHaveURL(/sort=saves/);
    await expect(page).toHaveURL(/q=Beyond/);
    await expect(row).toBeVisible();
  } finally {
    await session.dispose();
  }
});
