import { expect, test } from "./fixtures";
import { createBrowserSession } from "./session-fixture";
import { accessible } from "./a11y";

test("flagged profile names preserve the current public identity and the entered correction", async ({
  page,
  context,
}) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Local fake safety provider only.",
  );
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/account");
    const handle = await page.getByLabel("Public handle").inputValue();
    await page.getByLabel("Display name (optional)").fill("[safety:blocked]");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Please choose another handle or display name",
    );
    await expect(page.getByLabel("Display name (optional)")).toHaveValue(
      "[safety:blocked]",
    );
    await page.goto("/account");
    await expect(page.getByLabel("Public handle")).toHaveValue(handle);
    await expect(page.getByLabel("Display name (optional)")).toHaveValue("");
    await accessible(page);
  } finally {
    await page.close();
    await session.dispose();
  }
});

test("a transient safety failure is shown as an automatic check and never publishes the comment", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Local fake safety provider only.",
  );
  const session = await createBrowserSession(),
    body = `A pending comment ${testInfo.project.name} ${Date.now()} [safety:unavailable]`;
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/us/en/products/beyond-burger");
    const section = page.locator("section.comments");
    await section.getByLabel("Add your experience").fill(body);
    await section.getByRole("button", { name: "Post comment" }).click();
    await expect(
      section.getByRole("status").filter({ hasText: "Checking automatically" }),
    ).toContainText("Checking automatically");
    await expect(
      section.getByRole("listitem").filter({ hasText: body }),
    ).toHaveCount(0);
    await page.goto("/my-contributions");
    await expect(
      page.getByRole("heading", { name: "Automatic checks" }),
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "Checking automatically",
    );
    await accessible(page);
  } finally {
    await page.close();
    await session.dispose();
  }
});
