import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

test("one product reporting flow selects product information or a specific photo", async ({
  page,
  context,
}) => {
  test.skip(!!process.env.TEST_BASE_URL, "Report submissions are local only.");
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/us/products/oatly-full-fat?food=milk");
    const report = page.getByRole("link", {
      name: "Report product",
      exact: true,
    });
    await expect(report).toHaveCount(1);
    await page.getByText("Add or improve photos", { exact: true }).click();
    await expect(
      page.getByRole("link", { name: /Report (front )?photo/ }),
    ).toHaveCount(0);
    await report.click();
    await expect(
      page.getByRole("heading", { name: "Report this product", exact: true }),
    ).toBeVisible();
    const contributionUrl = page.url();
    const target = page.getByLabel("What would you like to report?");
    await expect(target).toHaveValue("");
    await page
      .getByLabel("Reason", { exact: true })
      .selectOption("incorrect_information");
    await target.selectOption({ label: "Front photo" });
    const photoId = await target.inputValue();
    await expect(
      page.getByRole("img", { name: "Photo being reported" }),
    ).toHaveAttribute("src", `/media/${photoId}/thumbnail`);
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(
      "wrong_product",
    );
    await accessible(page);
    await page
      .getByLabel("What does the evidence show?")
      .fill(
        "Synthetic local report exercising photo selection and moderation routing.",
      );
    const photoRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/v1/reports") &&
        request.method() === "POST",
    );
    await page
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    expect((await photoRequest).postDataJSON()).toMatchObject({
      targetType: "product_image",
      targetId: photoId,
      reason: "wrong_product",
    });
    await expect(page.getByText("Status: open", { exact: true })).toBeVisible();
    // Earlier photo-specific links enter the same form with that photo selected.
    await page.goto(`${contributionUrl}&image=${photoId}`);
    await expect(target).toHaveValue(photoId);
    await target.selectOption("");
    await expect(page.getByLabel("Reason", { exact: true })).toHaveValue(
      "ingredient_concern",
    );
    await expect(
      page.getByRole("img", { name: "Photo being reported" }),
    ).toHaveCount(0);
    await page
      .getByLabel("Reason", { exact: true })
      .selectOption("incorrect_information");
    await page
      .getByLabel("What does the evidence show?")
      .fill("Synthetic local report exercising product information selection.");
    const productRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/v1/reports") &&
        request.method() === "POST",
    );
    await page
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    expect((await productRequest).postDataJSON()).toMatchObject({
      targetType: "product",
      targetId: new URL(contributionUrl).pathname.split("/").at(-1),
      reason: "incorrect_information",
    });
    await expect(page.getByText("Status: open", { exact: true })).toBeVisible();
  } finally {
    await page.close();
    await session.dispose();
  }
});
