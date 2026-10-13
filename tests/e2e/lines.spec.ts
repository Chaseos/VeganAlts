import { expect, test } from "./fixtures";
import { accessible } from "./a11y";

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
