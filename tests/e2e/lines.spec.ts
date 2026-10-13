import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

// Milestone 7: a brand's recipe and its flavors rank as one line.
test("a recipe line lists its flavors, and its brand has a page", async ({
  page,
  request,
}) => {
  await page.goto("/us/milk");
  // The demo Oatly line has two flavors behind a native disclosure.
  const flavors = page.locator(".va-flavors").first();
  await expect(flavors.locator("summary")).toContainText("2 flavors");
  await flavors.locator("summary").click();
  await expect(flavors.getByRole("link")).toHaveCount(2);
  await accessible(page);

  // Instant answers find the brand from part of its name.
  const answers = await request.get("/api/v1/suggest?country=us&q=oatl");
  expect(
    ((await answers.json()) as { data: { brands: { slug: string }[] } }).data
      .brands[0]?.slug,
  ).toBe("oatly");

  await page.goto("/us/brand/oatly");
  await expect(
    page.getByRole("heading", { level: 1, name: "Oatly" }),
  ).toBeVisible();
  await expect(page.getByText("2 products in United States")).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Milk", exact: true })
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Add a product from Oatly" }),
  ).toHaveAttribute("href", "/add-product?country=us&brand=oatly");
  await accessible(page);
  // A brand with nothing here keeps a page that invites the first product.
  const elsewhere = await request.get("/ca/brand/oatly");
  expect(elsewhere.status()).toBe(200);
  expect(await elsewhere.text()).toContain("No Oatly products in Canada yet");
});

test("Add another flavor joins the product's line and publishes without review", async ({
  page,
  context,
}, testInfo) => {
  test.skip(Boolean(process.env.TEST_BASE_URL), "Sessions are local.");
  test.setTimeout(120000);
  const session = await createBrowserSession();
  const flavor = `Maple ${testInfo.project.name} ${Date.now()}`;
  try {
    await context.addCookies([session.cookie]);
    // The demo Nuggs line already has flavors, so adding one more leaves
    // other tests' single-flavor lines alone.
    await page.goto("/us/products/simulate-nuggs?food=chicken-nuggets");
    await page.getByRole("link", { name: "Add another flavor" }).click();
    // The food, brand and line come chosen; the name follows the flavor.
    await expect(
      page.getByRole("button", { name: "Change Chicken Nuggets" }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "A new flavor of Nuggs" }),
    ).toBeVisible();
    await page.getByLabel("Flavor (required)").fill(flavor);
    await expect(page.getByLabel("Product name (required)")).toHaveValue(
      `Nuggs, ${flavor}`,
    );
    await page
      .getByLabel("Front of pack photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await accessible(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    // Its line's flavors are siblings, so nothing holds it.
    await expect(
      page.getByRole("heading", { level: 1, name: `Nuggs, ${flavor}` }),
    ).toBeVisible();
    await expect(page.getByText("Your product is live")).toBeVisible();
    await expect(page.getByText(`Flavor: ${flavor}`)).toBeVisible();

    // A brand page's link starts with its brand and lists its lines.
    await page.goto("/add-product?country=us&brand=oatly");
    await expect(
      page.getByRole("button", { name: "Change brand Oatly" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Already listed from Oatly" }),
    ).toContainText("Oatly Oatmilk");
  } finally {
    await page.close();
    await session.dispose();
  }
});
