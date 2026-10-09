import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

test("comments post safely, vote once, report, hold for review and publish after operator review", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  test.setTimeout(120000);
  const author = await createBrowserSession(),
    voter = await createBrowserSession(),
    operator = await createBrowserSession({ administrator: true });
  const marker = `${testInfo.project.name}-${Date.now()}`;
  try {
    await context.addCookies([author.cookie]);
    await page.goto("/us/products/beyond-burger");
    const section = page.locator("section.comments");
    await expect(
      section.getByRole("heading", { name: "Notes from people who tried it" }),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Post comment" }),
    ).toBeEnabled();
    await section
      .getByLabel("Add your experience")
      .fill(
        `Sears well and stays juicy ${marker}. <script>window.__injected = true</script>`,
      );
    await section.getByRole("button", { name: "Post comment" }).click();
    await expect(section.getByRole("status")).toHaveText(
      "Your comment is posted.",
    );
    const posted = section
      .getByRole("listitem")
      .filter({ hasText: `Sears well and stays juicy ${marker}` });
    await expect(posted).toContainText(
      "<script>window.__injected = true</script>",
    );
    expect(
      await page.evaluate(
        () => (window as unknown as { __injected?: boolean }).__injected,
      ),
    ).toBeUndefined();
    // Authors cannot vote on their own comments.
    await expect(
      posted.getByRole("button", { name: /^Useful/ }),
    ).toBeDisabled();
    await section
      .getByLabel("Add your experience")
      .fill(`Check my shop for deals ${marker} [fake:recommended_action=HOLD]`);
    await section.getByRole("button", { name: "Post comment" }).click();
    await expect(section.getByRole("status")).toContainText(
      "after a moderator checks it",
    );
    const heldItem = section
      .getByRole("list", { name: "Your comments awaiting review" })
      .getByRole("listitem")
      .filter({ hasText: marker });
    await expect(heldItem).toBeVisible();
    const heldId = (await heldItem.getAttribute("id"))!.replace(/^held-/, "");
    await accessible(page);

    await context.clearCookies();
    await context.addCookies([voter.cookie]);
    await page.goto("/us/products/beyond-burger");
    const newest = section.getByRole("button", { name: "Newest" });
    // Controls stay disabled until hydration attaches their handlers.
    await expect(newest).toBeEnabled();
    await newest.press("Enter");
    await expect(
      section.getByRole("button", { name: "Newest" }),
    ).toHaveAttribute("aria-pressed", "true");
    const target = section
      .getByRole("listitem")
      .filter({ hasText: `Sears well and stays juicy ${marker}` });
    await expect(target).toBeVisible();
    await expect(
      section.getByText(`Check my shop for deals ${marker}`),
    ).toHaveCount(0);
    const useful = target.getByRole("button", { name: /^Useful/ });
    await useful.click();
    await expect(useful).toHaveAttribute("aria-pressed", "true");
    await expect(useful).toContainText("1");
    // Choosing the same vote again removes it.
    await useful.click();
    await expect(useful).toHaveAttribute("aria-pressed", "false");
    await expect(useful).toContainText("0");
    await useful.click();
    await target.getByRole("button", { name: "Report" }).click();
    await target.getByLabel("Why report this?").selectOption("off_topic");
    await target.getByRole("button", { name: "Send report" }).click();
    await expect(target.getByText("Report received")).toBeVisible();
    await accessible(page);
    await section.screenshot({
      path: testInfo.outputPath("comments-section.png"),
    });

    await context.clearCookies();
    await context.addCookies([operator.cookie]);
    await page.goto("/admin/moderation");
    await expect(
      page.locator(`a[href="/admin/moderation/comment/${heldId}"]`),
    ).toBeVisible();
    await page.goto(`/admin/moderation/comment/${heldId}`);
    await expect(
      page.getByRole("heading", { name: "Held comment" }),
    ).toBeVisible();
    await expect(
      page.getByText(`Check my shop for deals ${marker}`, { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Automated checks" }),
    ).toBeVisible();
    await page.getByLabel("Decision").selectOption("accept");
    await page
      .getByLabel("Reason and next steps")
      .fill("Reviewed the held comment for the browser acceptance check.");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: visible", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("held-comment-review.png"),
      fullPage: true,
    });
  } finally {
    await page.close();
    await author.dispose();
    await voter.dispose();
    await operator.dispose();
  }
});

test("an identical comment posted after deleting the first is saved as new", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  const author = await createBrowserSession();
  const body = `Crisps nicely in a pan ${testInfo.project.name}-${Date.now()}`;
  try {
    await context.addCookies([author.cookie]);
    await page.goto("/us/products/beyond-burger");
    const section = page.locator("section.comments");
    await expect(
      section.getByRole("button", { name: "Post comment" }),
    ).toBeEnabled();
    const post = async () => {
      await section.getByLabel("Add your experience").fill(body);
      await section.getByRole("button", { name: "Post comment" }).click();
      await expect(section.getByRole("status")).toHaveText(
        "Your comment is posted.",
      );
    };
    await post();
    page.once("dialog", (dialog) => void dialog.accept());
    await section
      .getByRole("listitem")
      .filter({ hasText: body })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(section.getByRole("status")).toHaveText(
      "Your comment is deleted.",
    );
    // The second post is a new action, not a replay of the deleted comment.
    await post();
    await page.reload();
    await expect(
      page
        .locator("section.comments")
        .getByRole("listitem")
        .filter({ hasText: body }),
    ).toBeVisible();
  } finally {
    await page.close();
    await author.dispose();
  }
});
