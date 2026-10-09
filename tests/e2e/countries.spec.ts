import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { chooseCountry } from "./site";
import { createBrowserSession } from "./session-fixture";

test("switching country keeps the food, remembers the choice and invites the first products", async ({
  page,
}) => {
  await page.goto("/us/ground-beef");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /ground beef/i,
  );
  await chooseCountry(page, "Canada");
  await expect(page).toHaveURL(/\/ca\/ground-beef$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /ground beef/i,
  );
  // United States products never appear in Canada.
  await expect(page.getByRole("link", { name: /Beyond Beef/ })).toHaveCount(0);

  // A product page moves to its food in the other country.
  await page.goto("/us/products/beyond-beef");
  await chooseCountry(page, "Canada");
  await expect(page).toHaveURL(/\/ca\/[a-z-]+$/);

  await page.goto("/ca");
  await expect(
    page.getByRole("heading", { name: "No rankings in Canada yet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add the first product" }),
  ).toHaveAttribute("href", "/add-product?country=ca");
  await accessible(page);

  // "/" sends a returning visitor to the remembered country after hydration.
  await page.goto("/");
  await expect(page).toHaveURL(/\/ca$/);
  await chooseCountry(page, "United States");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
});

test("only active countries route; the United States home lives at /", async ({
  request,
}) => {
  const moved = await request.get("/us", { maxRedirects: 0 });
  expect(moved.status()).toBe(301);
  expect(moved.headers().location).toBe("/");
  for (const path of ["/zz", "/zz/ground-beef", "/zz/products/beyond-beef"])
    expect((await request.get(path)).status(), path).toBe(404);
  // Product slugs belong to their country.
  expect((await request.get("/ca/products/beyond-beef")).status()).toBe(404);
  const api = await request.get("/api/v1/categories/ground-beef?country=CA");
  expect(api.status()).toBe(200);
  expect((await api.json()).data.ranked).toEqual([]);
  expect(
    (await request.get("/api/v1/categories/ground-beef?country=zz")).status(),
  ).toBe(404);
});

test("a product added from Ireland is published, rated and ranked in Ireland only", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  test.setTimeout(240000);
  const contributor = await createBrowserSession(),
    rater = await createBrowserSession(),
    operator = await createBrowserSession({ administrator: true }),
    name = `Shamrock ${testInfo.project.name} ${Date.now()}`;
  try {
    await context.addCookies([contributor.cookie]);
    // (Canada stays empty for the empty-country check above.)
    await page.goto("/add-product?country=ie");
    await expect(
      page.getByRole("main").getByRole("combobox", { name: "Country" }),
    ).toHaveValue("IE");
    await page.getByLabel("Product name", { exact: true }).fill(name);
    await page
      .getByLabel("Brand", { exact: true })
      .fill(`Maple Farms ${Date.now()}`);
    await page.getByLabel("Beef Burgers", { exact: true }).check();
    await page.getByRole("button", { name: "Check for matches" }).click();
    await page.getByRole("button", { name: "Add evidence" }).click();
    await page
      .getByLabel("Front photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await page
      .getByLabel(/Manufacturer ingredient source/)
      .fill("https://example.com/maple-ingredients");
    await page
      .getByLabel("What supports the ingredient classification?")
      .fill("The manufacturer ingredient list contains only plants.");
    await page.getByRole("button", { name: "Review submission" }).click();
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    // A clear submission publishes at once; anything else waits for review.
    const receipt = page.getByRole("link", { name: "View submission receipt" });
    await expect(
      page.getByRole("heading", { level: 1, name }).or(receipt),
    ).toBeVisible();
    if (await receipt.isVisible()) {
      await receipt.click();
      const receiptId = new URL(page.url()).pathname.split("/").at(-1)!;
      await context.clearCookies();
      await context.addCookies([operator.cookie]);
      await page.goto(`/admin/moderation/submission/${receiptId}`);
      await page
        .getByLabel("Reason and next steps")
        .fill("Reviewed the Irish test evidence for publication.");
      await page.getByRole("button", { name: "Save decision" }).click();
      await expect(
        page.getByText("Status: published", { exact: true }),
      ).toBeVisible();
    } else await expect(page).toHaveURL(/\/ie\/products\//);

    // Someone else in Ireland rates it from the food's ranking.
    await context.clearCookies();
    await context.addCookies([rater.cookie]);
    await page.goto("/ie/beef-burgers");
    await page
      .locator(".va-unrated")
      .filter({ hasText: name })
      .getByRole("link", { name: /Be the first to rate/ })
      .click();
    await expect(page).toHaveURL(/\/ie\/products\/.+\?food=beef-burgers/);
    const four = page.getByRole("button", { name: "4 Very close (4 of 5)" });
    await expect(four).toBeEnabled();
    await four.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved 4/5" }),
    ).toBeVisible();
    await page.goto("/ie/beef-burgers");
    await expect(page.locator(".va-rank-list")).toContainText(name);
    await page.goto("/us/beef-burgers");
    await expect(page.getByText(name)).toHaveCount(0);
  } finally {
    await page.close();
    await contributor.dispose();
    await rater.dispose();
    await operator.dispose();
  }
});
