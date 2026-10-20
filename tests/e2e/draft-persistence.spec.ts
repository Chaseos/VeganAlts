import { expect, test } from "./fixtures";
import { createBrowserSession } from "./session-fixture";
import { chooseFood, chooseBrand } from "./site";

test("warns about failed draft storage, keeps entries, and guards only work at risk", async ({
  page,
  context,
}) => {
  test.skip(Boolean(process.env.TEST_BASE_URL), "Local harness account only.");
  const session = await createBrowserSession();
  await context.addCookies([session.cookie]);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.includes("draft"))
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  try {
    await page.goto("/add-product?country=us");
    await expect(
      page.getByText("This draft isn’t safely saved on this device.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await chooseFood(page, "Ground Beef");
    await expect(
      page.getByText("This draft isn’t safely saved on this device.", {
        exact: true,
      }),
    ).toBeVisible();
    await chooseBrand(page, "Beyond Meat");
    const other = page.getByRole("button", {
      name: "Something else from Beyond Meat",
    });
    if (await other.isVisible()) await other.click();
    const name = page.getByLabel("Product name (required)", { exact: true });
    await name.fill("Draft kept after storage failure");
    await page
      .getByLabel("Front of pack photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await expect(
      page.getByText("This draft isn’t safely saved on this device.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry saving draft" }).click();
    await expect(name).toHaveValue("Draft kept after storage failure");
    await page.locator('a[href="/"]').first().click();
    const guard = page.getByRole("dialog", {
      name: "This draft isn’t safely saved",
    });
    await expect(guard).toBeVisible();
    await guard.getByRole("button", { name: "Keep editing" }).click();
    await expect(name).toHaveValue("Draft kept after storage failure");
    await page.locator('a[href="/"]').first().click();
    await guard.getByRole("button", { name: "Leave anyway" }).click();
    await expect(page).toHaveURL("/");
  } finally {
    await page.close();
    await session.dispose();
  }
});
