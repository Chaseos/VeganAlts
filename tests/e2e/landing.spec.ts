import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("landing is responsive and keyboard accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Find the closestvegan alternative.",
  );
  await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("public HTML is independent of authentication cookies", async ({
  request,
}) => {
  const anonymous = await request.get("/");
  const signedIn = await request.get("/", {
    headers: { Cookie: "better-auth.session_token=untrusted-cookie" },
  });
  expect(anonymous.status()).toBe(200);
  expect(await signedIn.text()).toBe(await anonymous.text());
  expect(anonymous.headers()["cache-control"]).toContain("public");
  expect(anonymous.headers()["set-cookie"]).toBeUndefined();
  const health = await request.get("/healthz");
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["cache-control"]).toContain("no-store");
});
