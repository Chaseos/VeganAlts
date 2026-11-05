import { expect, test } from "./fixtures";
import { createBrowserSession } from "./session-fixture";

const PRODUCT = "/us/products/beyond-burger";

test("a visitor who taps save signs in and finds the product saved", async ({
  page,
  context,
}) => {
  test.skip(!!process.env.TEST_BASE_URL, "Local test-harness session.");
  await page.goto(PRODUCT);
  const save = page.getByRole("button", { name: /^Save / });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(PRODUCT);

  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto(PRODUCT);
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await page.goto("/saved");
    await expect(
      page.getByRole("heading", { name: "Saved products" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Beyond/ })).toBeVisible();
    // Removing keeps the row, so a slip can be undone from the same place.
    await save.click();
    await expect(page.getByText("Removed from your list.")).toBeVisible();
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(page.getByText("Nothing saved yet.")).toBeVisible();
  } finally {
    await session.dispose();
  }
});

test("a signed-in person saves from the product page", async ({
  page,
  context,
}) => {
  test.skip(!!process.env.TEST_BASE_URL, "Local test-harness session.");
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto(PRODUCT);
    const save = page.getByRole("button", { name: /^Save / });
    await expect(save).toBeEnabled();
    await expect(save).toHaveAttribute("aria-pressed", "false");
    await save.click();
    await expect(save).toHaveAttribute("aria-pressed", "true");
    await expect(page).toHaveURL(new RegExp(`${PRODUCT}$`));
    await page.getByRole("link", { name: "your list" }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(
      page.getByRole("heading", { name: "Saved products" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Beyond/ })).toBeVisible();
  } finally {
    await session.dispose();
  }
});
