import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

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
    await page.getByText("Add or improve photos", { exact: true }).click();
    const slots = page.locator("section", {
      has: page.getByRole("heading", { name: "Product photos" }),
    });
    await expect(slots.getByRole("listitem")).toHaveCount(5);
    // Photo fixes are for administrators.
    await expect(page.getByText("Manage photos")).toHaveCount(0);
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
      await page.getByText("Add or improve photos", { exact: true }).click();
      await expect(
        slots.getByRole("link", { name: "Suggest a better photo: Prepared" }),
      ).toBeVisible();
    }
    await page.goto("/us/products/beyond-burger");
    await page.getByText("Add or improve photos", { exact: true }).click();
    await slots.screenshot({ path: testInfo.outputPath("photo-slots.png") });
  } finally {
    await page.close();
    await contributor.dispose();
  }
});

test("an administrator rotates and replaces a photo on the product page", async ({
  page,
  context,
}) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  const operator = await createBrowserSession({ administrator: true });
  try {
    await context.addCookies([operator.cookie]);
    await page.goto("/us/products/beyond-burger");
    await page.getByText("Manage photos", { exact: true }).click();
    const front = page.locator(".va-gallery img").first();
    const size = () =>
      front.evaluate((image: HTMLImageElement) => [
        image.naturalWidth,
        image.naturalHeight,
      ]);
    await expect.poll(size).not.toEqual([0, 0]);
    const [width, height] = await size();
    await accessible(page);
    await page.getByRole("button", { name: "Rotate Front photo left" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "rotated" }),
    ).toHaveText("Front photo rotated.");
    await expect.poll(size).toEqual([height, width]);
    const rotated = await front.getAttribute("src");
    await page
      .getByLabel("Photo file: Front")
      .setInputFiles("tests/fixtures/small.jpg");
    await expect(
      page.getByRole("status").filter({ hasText: "replaced" }),
    ).toHaveText("Front photo replaced.");
    await expect(front).not.toHaveAttribute("src", rotated!);
  } finally {
    await operator.dispose();
  }
});
