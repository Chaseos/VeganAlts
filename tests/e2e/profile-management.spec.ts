import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

test("profile saves survive reload; reserved and occupied handles preserve the saved profile", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Disposable local accounts only.",
  );
  const first = await createBrowserSession(),
    second = await createBrowserSession();
  const handle = `release_${testInfo.project.name}_${Date.now()}`.slice(0, 30);
  try {
    await context.addCookies([first.cookie]);
    await page.goto("/account");
    await page.getByLabel("Public handle").fill(handle);
    await page.getByLabel("Display name (optional)").fill("Release reviewer");
    await page.getByRole("button", { name: "Save profile" }).press("Enter");
    await expect(page.getByRole("status")).toContainText("saved");
    await page.reload();
    await expect(page.getByLabel("Public handle")).toHaveValue(handle);
    await expect(page.getByLabel("Display name (optional)")).toHaveValue(
      "Release reviewer",
    );
    await page.getByLabel("Public handle").fill("admin");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("alert")).toContainText("reserved");
    // Reloading a refused form sends it again, so open the page fresh.
    await page.goto("/account");
    await expect(page.getByLabel("Public handle")).toHaveValue(handle);
    await context.addCookies([second.cookie]);
    await page.goto("/account");
    const original = await page.getByLabel("Public handle").inputValue();
    await page.getByLabel("Public handle").fill(handle);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByRole("alert")).toContainText("already");
    await page.goto("/account");
    await expect(page.getByLabel("Public handle")).toHaveValue(original);
    await accessible(page);
  } finally {
    await page.close();
    await first.dispose();
    await second.dispose();
  }
});
