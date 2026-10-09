import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

test("a proposed category is reviewed, created, renamed with a redirect and merged with a redirect", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  test.setTimeout(120000);
  const contributor = await createBrowserSession(),
    operator = await createBrowserSession({ administrator: true });
  const stamp = `${testInfo.project.name}${Date.now().toString(36)}`;
  const name = `Bratwurst ${stamp}`;
  try {
    await context.addCookies([contributor.cookie]);
    await page.goto(`/us/search?q=${encodeURIComponent(name)}`);
    await page
      .getByRole("link", { name: "Propose a missing category" })
      .click();
    await expect(page.getByLabel("Conventional food")).toHaveValue(name);
    await expect(page.getByLabel("Conventional food")).toBeEnabled();
    // Category proposals choose the shelf the food belongs on.
    await page
      .getByLabel("Aisle and shelf")
      .selectOption({ label: "Meat · Pork" });
    await page
      .getByLabel("Why is a separate category needed?")
      .fill("Plant-based bratwurst is sold widely and has no category yet.");
    await accessible(page);
    await page.getByRole("button", { name: "Send proposal" }).click();
    await expect(page.getByRole("status")).toContainText("in review");

    await context.clearCookies();
    await context.addCookies([operator.cookie]);
    await page.goto("/admin/moderation?filter=high_risk");
    await page.getByRole("link", { name: new RegExp(name) }).click();
    await expect(
      page.getByRole("heading", { name: `Proposed category: ${name}` }),
    ).toBeVisible();
    const slug = `bratwurst-${stamp}`;
    await page.getByLabel("Slug").fill(slug);
    await page
      .getByLabel("Reason and next steps")
      .fill("Distinct reference food; accepted for the browser check.");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: accepted", { exact: true }),
    ).toBeVisible();
    await page.goto(`/us/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);

    await page.goto("/admin/taxonomy");
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    const renamed = `${slug}-links`;
    await page.locator(`input[name="slug"][value="${slug}"]`).fill(renamed);
    await page
      .getByRole("textbox", { name: "Reason" })
      .first()
      .fill("Clearer address for the browser check.");
    await page.getByRole("button", { name: "Save category" }).click();
    await expect(page.getByRole("status")).toContainText("updated");
    await page.goto(`/us/${slug}`);
    await expect(page).toHaveURL(new RegExp(`/us/${renamed}$`));

    // Merge a second new category into it; the donor URL then redirects.
    await page.goto("/admin/taxonomy");
    const donorName = `Brats ${stamp}`;
    await page.getByLabel("Conventional food").fill(donorName);
    await page
      .locator("#new-note")
      .fill("Duplicate created for the merge check.");
    await page.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByRole("status")).toContainText("created");
    await page
      .getByLabel("Duplicate to retire")
      .selectOption({ label: donorName });
    await page.getByLabel("Category to keep").selectOption({ label: name });
    await page
      .locator("#merge-note")
      .fill("Same reference food; merging duplicate.");
    await page.getByRole("button", { name: "Merge categories" }).click();
    await expect(page.getByRole("status")).toContainText("merged into");
    await page.goto(`/us/brats-${stamp}`);
    await expect(page).toHaveURL(new RegExp(`/us/${renamed}$`));
    await page.goto("/admin/taxonomy");
    await accessible(page);
    await page.screenshot({
      path: testInfo.outputPath("taxonomy.png"),
      fullPage: true,
    });
  } finally {
    await page.close();
    await contributor.dispose();
    await operator.dispose();
  }
});
