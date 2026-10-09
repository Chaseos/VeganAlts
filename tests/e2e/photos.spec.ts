import { expect, test, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { createBrowserSession } from "./session-fixture";

async function accessible(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("canonical photo slots offer add or replace, never an append gallery", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  test.setTimeout(120000);
  const contributor = await createBrowserSession();
  try {
    await context.addCookies([contributor.cookie]);
    await page.goto("/us/products/beyond-burger");
    const slots = page.locator("section", {
      has: page.getByRole("heading", { name: "Product photos" }),
    });
    await expect(slots.getByRole("listitem")).toHaveCount(5);
    // The seeded front photo can only be replaced, not appended to.
    await expect(
      slots.getByRole("link", { name: "Suggest a better photo: Front" }),
    ).toBeVisible();
    const prepared = slots.getByRole("link", {
      name: /^(Add photo|Suggest a better photo): Prepared$/,
    });
    const label = await prepared.getAttribute("aria-label");
    await prepared.click();
    await expect(page).toHaveURL(/action=photo&slot=prepared/);
    await expect(page.getByLabel("Photo", { exact: true })).toHaveValue(
      "prepared",
    );
    await page
      .getByLabel(/Prepared photo/)
      .setInputFiles("tests/fixtures/small.jpg");
    await page
      .getByLabel("What does the photo show?")
      .fill(`Cooked patty on a plate, ${testInfo.project.name} fixture.`);
    await accessible(page);
    await page.getByRole("button", { name: "Submit photo" }).click();
    // A photo identical to an open proposal is recorded as a confirmation.
    await expect(
      page
        .getByText(/Status: (accepted|pending)/)
        .or(page.getByRole("heading", { name: "Suggested changes" })),
    ).toBeVisible();
    if (label?.startsWith("Add")) {
      await page.goto("/us/products/beyond-burger");
      await expect(
        slots.getByRole("link", { name: "Suggest a better photo: Prepared" }),
      ).toBeVisible();
    }
    await page.goto("/us/products/beyond-burger");
    await slots.screenshot({ path: testInfo.outputPath("photo-slots.png") });
  } finally {
    await page.close();
    await contributor.dispose();
  }
});
