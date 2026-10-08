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

test("a fact proposal is confirmed once by an independent contributor and appears in the operator queue", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  test.setTimeout(120000);
  const proposer = await createBrowserSession(),
    confirmer = await createBrowserSession(),
    operator = await createBrowserSession({ administrator: true });
  const alias = `Plant crumble ${testInfo.project.name} ${Date.now()}`;
  try {
    await context.addCookies([proposer.cookie]);
    await page.goto("/us/products/beyond-burger");
    await page.getByRole("link", { name: "Suggest a change" }).click();
    await expect(page.getByLabel("What changed?")).toBeEnabled();
    await page.getByLabel("What changed?").selectOption("alias");
    await page.getByLabel("Other name").fill(alias);
    await page
      .getByLabel("What does the evidence show?")
      .fill("Shoppers in my area search for it by this name.");
    await accessible(page);
    await page
      .getByRole("button", { name: "Submit proposal for review" })
      .click();
    // Local development evaluates tier 1 additions with the fake provider.
    await expect(page.getByText(/Status: (accepted|pending)/)).toBeVisible();

    await page.goto("/us/products/beyond-burger");
    await page.getByRole("link", { name: "Suggest a change" }).click();
    await page.getByLabel("What changed?").selectOption("rename");
    await page
      .getByLabel("Name as printed on the package")
      .fill(`Beyond Burger ${testInfo.project.name} ${Date.now()}`);
    await page
      .getByLabel("What does the evidence show?")
      .fill("The new package prints this exact name on the front.");
    await page
      .getByRole("button", { name: "Submit proposal for review" })
      .click();
    await expect(
      page.getByText("Status: pending", { exact: true }),
    ).toBeVisible();
    const proposalId = new URL(page.url()).pathname.split("/").at(-1)!;

    await context.clearCookies();
    await context.addCookies([confirmer.cookie]);
    await page.goto("/us/products/beyond-burger");
    const panel = page.locator("section", {
      has: page.getByRole("heading", { name: "Suggested changes" }),
    });
    const item = panel
      .getByRole("listitem")
      .filter({ hasText: "Rename to" })
      .first();
    await expect(item).toBeVisible();
    const confirm = item.getByRole("button", { name: "Confirm" });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(panel.getByRole("status")).toContainText(
      "confirmation is recorded",
    );
    await expect(item.getByRole("button", { name: "Confirm" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await accessible(page);

    await context.clearCookies();
    await context.addCookies([operator.cookie]);
    await page.goto("/admin/moderation?filter=confirmation");
    await expect(
      page.locator(`a[href="/admin/moderation/proposal/${proposalId}"]`),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("confirmation-queue.png"),
      fullPage: true,
    });
  } finally {
    await page.close();
    await proposer.dispose();
    await confirmer.dispose();
    await operator.dispose();
  }
});
