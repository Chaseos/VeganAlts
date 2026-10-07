import { expect, test, type Page } from "@playwright/test";
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
test("submission, private receipt, operator publication, reporting, formula history and duplicate reversal", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  test.setTimeout(120000);
  const contributor = await createBrowserSession(),
    operator = await createBrowserSession({ administrator: true }),
    name = `Community ${testInfo.project.name} ${Date.now()}`;
  try {
    await context.addCookies([contributor.cookie]);
    await page.goto("/add-product");
    await page.getByLabel("Product name", { exact: true }).fill(name);
    await page
      .getByLabel("Brand", { exact: true })
      .fill(`Garden ${Date.now()}`);
    await page.getByLabel("Beef Burgers", { exact: true }).check();
    await accessible(page);
    await page
      .getByRole("button", { name: "Check for matches" })
      .press("Enter");
    await expect(
      page.getByRole("heading", { name: "Check existing products" }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Add evidence" }).click();
    await page
      .getByLabel("Front photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await page
      .getByLabel(/Manufacturer ingredient source/)
      .fill("http://example.com/manufacturer-ingredients");
    await page
      .getByLabel("What supports the ingredient classification?")
      .fill(
        "The ingredient source lists only plants. This synthetic browser fixture requires manual category review.",
      );
    await page
      .getByText("Variants and related products (optional)", { exact: true })
      .click();
    await page.getByLabel(/Specialty flavor/).check();
    await page.getByRole("button", { name: "Review submission" }).click();
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("HTTPS");
    await expect(page.getByRole("alert")).toBeFocused();
    await page
      .getByRole("button", { name: "Edit evidence", exact: true })
      .click();
    await page
      .getByLabel(/Manufacturer ingredient source/)
      .fill("https://example.com/manufacturer-ingredients");
    await page.getByRole("button", { name: "Review submission" }).click();
    await page.screenshot({
      path: testInfo.outputPath("submission-review.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    await page.getByRole("link", { name: "View submission receipt" }).click();
    await expect(
      page.getByText("Status: review", { exact: true }),
    ).toBeVisible();
    let receiptId = new URL(page.url()).pathname.split("/").at(-1)!;
    const originalReceiptId = receiptId;
    const unauthorized = await page.request.get(
      "/api/v1/admin/moderation/inbox",
    );
    expect(unauthorized.status()).toBe(403);
    await accessible(page);
    await context.addCookies([operator.cookie]);
    await page.goto(`/admin/moderation/submission/${receiptId}`);
    await expect(
      page.getByRole("heading", { name: "Private evidence" }),
    ).toBeVisible();
    await accessible(page);
    await page.screenshot({
      path: testInfo.outputPath("operator-review.png"),
      fullPage: true,
    });
    await page
      .getByLabel("Decision", { exact: true })
      .selectOption("follow_up");
    await page
      .getByLabel("Reason and next steps")
      .fill(
        "Please clarify the flavor and attach the corrected ingredient source.",
      );
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText(
        "Please clarify the flavor and attach the corrected ingredient source.",
        { exact: true },
      ),
    ).toBeVisible();
    await context.addCookies([contributor.cookie]);
    await page.goto(`/my-contributions/submission/${receiptId}`);
    await page.getByRole("link", { name: "Respond to follow-up" }).click();
    await expect(page.getByLabel("Product name", { exact: true })).toHaveValue(
      name,
    );
    await expect(
      page.getByRole("complementary", { name: "Requested follow-up" }),
    ).toContainText("Please clarify");
    await page.getByRole("button", { name: "Check for matches" }).click();
    await page.getByRole("button", { name: "Add evidence" }).click();
    await page
      .getByLabel("Front photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await page
      .getByLabel(/Manufacturer ingredient source/)
      .fill("https://example.com/corrected-ingredients");
    await page
      .getByLabel("What supports the ingredient classification?")
      .fill("Updated manufacturer source for the original flavor and recipe.");
    await page
      .getByText("Variants and related products (optional)", { exact: true })
      .click();
    await page.getByLabel(/Specialty flavor/).uncheck();
    await accessible(page);
    await page.screenshot({
      path: testInfo.outputPath("submission-follow-up.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Review submission" }).click();
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    await page.getByRole("link", { name: "View submission receipt" }).click();
    await expect(
      page.getByText("Status: review", { exact: true }),
    ).toBeVisible();
    receiptId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect(receiptId).not.toBe(originalReceiptId);
    await page
      .getByRole("link", { name: "original submission and evidence" })
      .click();
    await expect(
      page.getByText("Status: superseded", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "front evidence" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Respond to follow-up" }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "revised submission", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/submission/${receiptId}$`));
    await context.addCookies([operator.cookie]);
    await page.goto(`/admin/moderation/submission/${receiptId}`);
    await page
      .getByLabel("Reason and next steps")
      .fill(
        "Reviewed the synthetic test evidence and specialty category handling.",
      );
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: published", { exact: true }),
    ).toBeVisible();
    const receipt = await (
      await page.request.get(`/api/v1/me/contributions/submission/${receiptId}`)
    ).json();
    const productId = receipt.data.productId;
    const current = await (
      await page.request.get(`/api/v1/community/products/${productId}`)
    ).json();
    const slug = current.data.slug;
    await context.addCookies([contributor.cookie]);
    await page.goto(`/us/products/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("New", { exact: true })).toBeVisible();
    await page
      .getByRole("link", { name: "Report product", exact: true })
      .click();
    await page
      .getByLabel("Reason", { exact: true })
      .selectOption("ingredient_concern");
    await page
      .getByLabel("What does the evidence show?")
      .fill(
        "Synthetic test concern to verify operator assessment and history.",
      );
    await page
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    await expect(page.getByText("Status: open", { exact: true })).toBeVisible();
    const reportId = new URL(page.url()).pathname.split("/").at(-1)!;
    await context.addCookies([operator.cookie]);
    await page.goto(`/admin/moderation/report/${reportId}`);
    await page.getByLabel("Catalog effect").selectOption("under_review");
    await page
      .getByLabel("Reason and next steps")
      .fill("Assessed the concern and applied temporary Under Review.");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: resolved", { exact: true }),
    ).toBeVisible();
    await page.goto(`/us/products/${slug}`);
    await expect(
      page.getByText(/An operator is assessing an ingredient concern/),
    ).toBeVisible();
    await context.addCookies([contributor.cookie]);
    await page.goto(`/contribute/${productId}`);
    await page.getByLabel("What changed?").selectOption("reformulation");
    await page.getByLabel("Formula label").fill("Updated test formula");
    await page
      .getByLabel("Approximate effective date (optional)")
      .fill("2026-09");
    await page
      .getByLabel("Proposed platform classification")
      .selectOption("appears_vegan");
    await page
      .getByLabel("What does the evidence show?")
      .fill(
        "A material recipe change, with complete manufacturer ingredients recorded.",
      );
    await page
      .getByRole("button", { name: "Submit proposal for review" })
      .click();
    await expect(
      page.getByText("Status: pending", { exact: true }),
    ).toBeVisible();
    const proposalId = new URL(page.url()).pathname.split("/").at(-1)!;
    await context.addCookies([operator.cookie]);
    await page.goto(`/admin/moderation/proposal/${proposalId}`);
    await page
      .getByLabel("Reason and next steps")
      .fill("Material change verified; preserve the previous formula history.");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: accepted", { exact: true }),
    ).toBeVisible();
    await page.goto(`/us/products/${slug}`);
    await expect(
      page.getByRole("link", { name: "Original formula", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("formula-history.png"),
      fullPage: true,
    });
    await context.addCookies([contributor.cookie]);
    await page
      .getByRole("link", { name: "Suggest a change", exact: true })
      .click();
    await page.getByLabel("What changed?").selectOption("packaging");
    await page
      .getByLabel("Front photo (optional)", { exact: true })
      .setInputFiles({
        name: "invalid.png",
        mimeType: "image/png",
        buffer: Buffer.from("Invalid image fixture"),
      });
    await page
      .getByLabel("What does the evidence show?")
      .fill(
        "Updated synthetic packaging for the same recipe; preserve the formula and ratings.",
      );
    await page
      .getByRole("button", { name: "Submit proposal for review" })
      .click();
    await expect(page.getByRole("alert")).toBeFocused();
    await page
      .getByRole("button", { name: "Revise photos", exact: true })
      .click();
    await page
      .getByLabel("Front photo (optional)", { exact: true })
      .setInputFiles("tests/fixtures/small.jpg");
    await page
      .getByRole("button", { name: "Submit proposal for review" })
      .click();
    await expect(
      page.getByText("Status: pending", { exact: true }),
    ).toBeVisible();
    const packagingId = new URL(page.url()).pathname.split("/").at(-1)!;
    await context.addCookies([operator.cookie]);
    await page.goto(`/admin/moderation/proposal/${packagingId}`);
    await page
      .getByLabel("Reason and next steps")
      .fill("Verified packaging-only change with no recipe difference.");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: accepted", { exact: true }),
    ).toBeVisible();
    await page.goto(`/us/products/${slug}`);
    await expect(
      page.getByRole("img", { name: `${name} package`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Updated test formula", exact: true }),
    ).toBeVisible();
    await page.goto(`/admin/moderation/consolidate?donor=${productId}`);
    await page
      .getByLabel("Product to keep", { exact: true })
      .selectOption({ label: "Beyond Burger" });
    await page.getByRole("button", { name: "Preview consolidation" }).click();
    await expect(
      page.getByText(/The survivor keeps its metadata and scores/),
    ).toBeVisible();
    await page
      .getByLabel("Evidence that these are the same product")
      .fill("Synthetic fixture exercising recoverable duplicate archival.");
    await page.screenshot({
      path: testInfo.outputPath("duplicate-preview.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Archive duplicate and redirect" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Decision history" }),
    ).toBeVisible();
    const redirect = await page.request.get(
      `/us/products/${slug}?version=donor-only`,
      { maxRedirects: 0 },
    );
    expect(redirect.status()).toBe(302);
    expect(redirect.headers().location).toBe("/us/products/beyond-burger");
    expect(redirect.headers()["cache-control"]).toContain("no-store");
    const apiRedirect = await page.request.get(
      `/api/v1/products/${slug}?version=donor-only`,
      { maxRedirects: 0 },
    );
    expect(apiRedirect.status()).toBe(302);
    expect(apiRedirect.headers().location).toBe(
      "/api/v1/products/beyond-burger",
    );
    expect(apiRedirect.headers()["cache-control"]).toContain("no-store");
    const dataRedirect = await page.request.get(
      `/us/products/${slug}.data?version=donor-only`,
      { maxRedirects: 0 },
    );
    expect(dataRedirect.status()).toBe(202);
    expect(dataRedirect.headers()["cache-control"]).toContain("no-store");
    expect(await dataRedirect.text()).toContain("/us/products/beyond-burger");
    await page
      .locator("li")
      .filter({ has: page.getByText("consolidation", { exact: true }) })
      .getByRole("button", { name: "Review reversal" })
      .click();
    await page
      .getByLabel("Reason for reversal")
      .fill(
        "The test confirms archival recovery; restore the distinct product.",
      );
    await page.getByRole("button", { name: "Confirm reversal" }).click();
    await expect(
      page.getByRole("button", { name: "Confirm reversal" }),
    ).toHaveCount(0);
    await page.goto(`/us/products/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  } finally {
    await page.close();
    await contributor.dispose();
    await operator.dispose();
  }
});

test("retailer proposal and one-person confirmation are accessible", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  const contributor = await createBrowserSession(),
    operator = await createBrowserSession({ administrator: true });
  try {
    await context.addCookies([contributor.cookie]);
    await page.goto("/us/products/beyond-burger");
    await page.getByRole("link", { name: "Add or confirm a retailer" }).click();
    await expect(page).toHaveURL(/\/contribute\/.*action=retailer/);
    const contributeUrl = page.url(),
      name = `Garden Market ${testInfo.project.name} ${Date.now()}`;
    await page
      .getByRole("button", { name: "Propose a retailer", exact: true })
      .click();
    await page.getByLabel("Retailer name", { exact: true }).fill(name);
    await page
      .getByLabel("Official retailer website")
      .fill("https://example.com");
    await page
      .getByLabel("Why should this retailer be added?")
      .fill("Synthetic retailer fixture for browser acceptance checks.");
    await page
      .getByRole("button", { name: "Submit retailer proposal" })
      .click();
    await expect(
      page.getByText("Status: pending", { exact: true }),
    ).toBeVisible();
    const proposalId = new URL(page.url()).pathname.split("/").at(-1)!;
    await context.addCookies([operator.cookie]);
    await page.goto(`/admin/moderation/proposal/${proposalId}`);
    await page
      .getByLabel("Reason and next steps")
      .fill("US retailer identity confirmed for the acceptance fixture.");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: accepted", { exact: true }),
    ).toBeVisible();
    await context.addCookies([contributor.cookie]);
    await page.goto(contributeUrl);
    await page.getByLabel("Find a retailer").fill(name);
    await page.getByLabel("Canonical retailer").selectOption({ label: name });
    await accessible(page);
    await page.getByRole("button", { name: "Save availability" }).click();
    await expect(
      page.locator("#retailers").getByText(name, { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("#retailers li").filter({ hasText: name }),
    ).toContainText("1 contributor");
    await page.screenshot({
      path: testInfo.outputPath("retailer-confirmation.png"),
      fullPage: true,
    });
  } finally {
    await page.close();
    await contributor.dispose();
    await operator.dispose();
  }
});
