import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { chooseCountry } from "./site";

test("switching country keeps the food, remembers the choice and invites the first products", async ({
  page,
}) => {
  await page.goto("/us/ground-beef");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Ground Beef",
  );
  await chooseCountry(page, "Canada");
  await expect(page).toHaveURL(/\/ca\/ground-beef$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Ground Beef",
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
