import { expect, test, type Page } from "./fixtures";
import { accessible } from "./a11y";
import { chooseBrand } from "./site";
import { createBrowserSession } from "./session-fixture";

async function reverse(page: Page, note: string) {
  const entry = page
    .locator(".contribution-list > li")
    .filter({ hasText: note });
  await entry.getByRole("button", { name: "Review reversal" }).click();
  await page
    .getByLabel("Reason for reversal")
    .fill("Restored after the local browser verification.");
  await page.getByRole("button", { name: "Confirm reversal" }).click();
  await expect(entry).toContainText("Reversed");
}

test("scope reports lead to reversible product removal, with a separate direct removal control", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Catalog mutations are confined to the local test database.",
  );
  test.setTimeout(120000);
  const contributor = await createBrowserSession();
  const operator = await createBrowserSession({ administrator: true });
  const marker = `${testInfo.project.name}-${Date.now()}`;
  try {
    await context.addCookies([contributor.cookie]);
    await page.goto("/us/products/oatly-full-fat");
    await expect(
      page.getByRole("link", { name: "Manage product", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "Report product", exact: true })
      .click();
    await page
      .getByLabel("Reason", { exact: true })
      .selectOption({ label: "Doesn’t belong on VeganAlts" });
    const productId = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(
      page.getByText(/manufacturer-supported vegan preparation/),
    ).toBeVisible();
    await page
      .getByLabel("What would you like to report?")
      .selectOption({ label: "Front photo" });
    await expect(
      page.getByRole("option", { name: "Doesn’t belong on VeganAlts" }),
    ).toHaveCount(0);
    await page.getByLabel("What would you like to report?").selectOption("");
    await page
      .getByLabel("Reason", { exact: true })
      .selectOption("out_of_scope");
    await page
      .getByLabel("What does the evidence show?")
      .fill(`Synthetic scope report for browser verification ${marker}.`);
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/v1/reports") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Submit report", exact: true })
      .click();
    const reportId = (await (await response).json()).data.id as string;
    await expect(page.getByText("Status: open", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Doesn’t belong on VeganAlts", { exact: true }),
    ).toBeVisible();

    await context.clearCookies();
    await context.addCookies([operator.cookie]);
    await page.goto(`/admin/moderation/report/${reportId}`);
    await page.getByLabel("Catalog effect").selectOption("remove_product");
    await expect(
      page.getByText(/This removes the product from public pages/),
    ).toBeVisible();
    const reportNote = `Scope assessed for local browser verification ${marker}.`;
    await page.getByLabel("Reason and next steps").fill(reportNote);
    await accessible(page);
    await page.screenshot({
      path: testInfo.outputPath("scope-report-review.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: resolved", { exact: true }),
    ).toBeVisible();
    await page.goto(`/admin/moderation/products/${productId}`);
    await expect(page.getByRole("status")).toContainText(
      "removed from public view",
    );
    await expect(
      page.getByRole("button", { name: "Remove from catalog" }),
    ).toHaveCount(0);
    await reverse(page, reportNote);

    const remove = page.getByRole("button", { name: "Remove from catalog" });
    await expect(remove).toBeVisible();
    await remove.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Reason for removal")).toBeFocused();
    await page
      .locator("#product-removal-form")
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(remove).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Confirm removal" }),
    ).toHaveCount(0);
    await remove.click();
    const directNote = `Direct catalog removal for local browser verification ${marker}.`;
    await page.getByLabel("Reason for removal").fill(directNote);
    await accessible(page);
    await page.screenshot({
      path: testInfo.outputPath("product-removal.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Confirm removal" }).click();
    await expect(page.getByRole("status")).toContainText(
      "removed from public view",
    );
    await reverse(page, directNote);
    await expect(remove).toBeVisible();
    await page.goto("/us/products/oatly-full-fat");
    await expect(
      page.getByRole("link", { name: "Report product", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Manage product", exact: true })
      .click();
    await expect(remove).toBeVisible();
  } finally {
    await page.close();
    await contributor.dispose();
    await operator.dispose();
  }
});

test("admins can hide a comment directly and restore it from history; contributors have no hide control", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Comment moderation is confined to the local test database.",
  );
  test.setTimeout(120000);
  const author = await createBrowserSession();
  const operator = await createBrowserSession({ administrator: true });
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const body = `Sears well and stays juicy for this local check ${marker}.`;
  try {
    await context.addCookies([author.cookie]);
    await page.goto("/us/products/beyond-burger");
    const section = page.locator("section.comments");
    await section.getByLabel("Add your experience").fill(body);
    await section.getByRole("button", { name: "Post comment" }).click();
    await expect(section.getByRole("status")).toHaveText(
      "Your comment is posted.",
    );
    await expect(
      section.getByRole("button", { name: "Hide comment", exact: true }),
    ).toHaveCount(0);

    await context.clearCookies();
    await context.addCookies([operator.cookie]);
    await page.goto("/us/products/beyond-burger");
    await section.getByRole("button", { name: "Newest", exact: true }).click();
    const comment = section.getByRole("listitem").filter({ hasText: body });
    const hide = comment.getByRole("button", {
      name: "Hide comment",
      exact: true,
    });
    await expect(hide).toBeVisible();
    await hide.focus();
    await page.keyboard.press("Enter");
    await expect(comment.getByLabel("Reason for hiding")).toBeFocused();
    await comment.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(hide).toBeFocused();
    await hide.click();
    const note = `Hidden for local browser verification ${marker}.`;
    await comment.getByLabel("Reason for hiding").fill(note);
    await accessible(page);
    await comment.screenshot({
      path: testInfo.outputPath("direct-comment-hide.png"),
    });
    await comment.getByRole("button", { name: "Confirm hide" }).click();
    await expect(comment).toHaveCount(0);
    await expect(section.getByRole("status")).toContainText(
      "Comment hidden from public view.",
    );
    await expect(section.getByRole("status")).toBeFocused();
    await section
      .getByRole("link", { name: "Review history or restore a comment" })
      .click();
    await reverse(page, note);
    await page.goto("/us/products/beyond-burger");
    await section.getByRole("button", { name: "Newest", exact: true }).click();
    await expect(comment).toBeVisible();
  } finally {
    await page.close();
    await author.dispose();
    await operator.dispose();
  }
});

test("an administrator edits a product from the same form, applied at once", async ({
  page,
  context,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Catalog mutations are confined to the local test database.",
  );
  const operator = await createBrowserSession({ administrator: true });
  try {
    await context.addCookies([operator.cookie]);
    await page.goto("/us/products/oatly-full-fat");
    await page
      .getByRole("link", { name: "Manage product", exact: true })
      .click();
    await page.getByRole("link", { name: "Edit product", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Edit product" }),
    ).toBeVisible();
    await expect(page.getByText("apply immediately")).toBeVisible();
    await accessible(page);
    // What can change is on show, each with its own way in.
    await page
      .getByRole("button", { name: "Change food", exact: true })
      .click();
    await expect(page.getByLabel("What do you want to change?")).toHaveValue(
      "foods",
    );
    const current = page
      .getByRole("group", { name: "Listed under" })
      .getByRole("checkbox")
      .first();
    await expect(current).toBeChecked();
    await page
      .getByLabel("Move it to", { exact: true })
      .selectOption({ index: 1 });
    // Moving takes it out of where it was, unless ticked again.
    await expect(current).not.toBeChecked();
    await page
      .getByLabel("Reason for this change")
      .fill("Listed under the wrong food during import.");
    await page
      .getByRole("button", { name: "Save change", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/moderation\/products\//);
    await expect(page.getByRole("main")).toContainText(
      "Listed under the wrong food during import.",
    );
  } finally {
    await operator.dispose();
  }
});

test("an administrator moves a product to another brand", async ({
  page,
  context,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Catalog mutations are confined to the local test database.",
  );
  const operator = await createBrowserSession({ administrator: true });
  try {
    await context.addCookies([operator.cookie]);
    await page.goto("/us/products/beyond-nuggets");
    await page
      .getByRole("link", { name: "Manage product", exact: true })
      .click();
    await page.getByRole("link", { name: "Edit product", exact: true }).click();
    await page
      .getByRole("button", { name: "Change brand", exact: true })
      .click();
    // Change moves focus to the edit, a frame later.
    await expect(page.getByLabel("What do you want to change?")).toBeFocused();
    await chooseBrand(page, "Oatly");
    await page.getByLabel("New line’s name").fill(`Moved ${Date.now()}`);
    await page
      .getByLabel("Reason for this change (optional)")
      .fill("Wrong brand.");
    await page
      .getByRole("button", { name: "Save change", exact: true })
      .click();
    await expect(page).toHaveURL(/\/admin\/moderation\/products\//);
    await expect(page.getByRole("main")).toContainText("Wrong brand.");
    // The move can be undone, which also leaves the shared catalog as it was.
    await page.getByRole("button", { name: "Review reversal" }).first().click();
    await page
      .getByLabel("Reason for reversal")
      .fill("Restoring the original brand.");
    await page.getByRole("button", { name: "Confirm reversal" }).click();
    await expect(page.getByRole("main")).toContainText(
      "Restoring the original brand.",
    );
  } finally {
    await operator.dispose();
  }
});
