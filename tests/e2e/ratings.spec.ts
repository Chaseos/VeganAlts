import { expect, test } from "./fixtures";
import { openAccountLink } from "./site";
import { createBrowserSession } from "./session-fixture";

test("anonymous selection resumes once after sign-in, then appears in My Ratings and can be edited", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Real staging provider returns are verified interactively; simulation is local only.",
  );
  const session = await createBrowserSession();
  try {
    await page.goto("/us/beef-burgers");
    await page
      .locator(".product-link")
      .filter({ hasText: "Beyond Beef" })
      .click();
    const saves: number[] = [];
    page.on("request", (request) => {
      if (
        request.url().endsWith("/api/v1/ratings") &&
        request.method() === "PUT"
      )
        saves.push(request.postDataJSON().overallSimilarity);
    });
    await page
      .getByRole("button", { name: "4 Very close (4 of 5)" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
    await expect(
      page.getByRole("heading", { name: "Sign in to VeganAlts" }),
    ).toBeVisible();
    await context.addCookies([session.cookie]);
    await page.goto(`/auth/return?returnTo=${encodeURIComponent(returnTo)}`);
    await expect(
      page.getByRole("status").filter({ hasText: "Saved 4/5" }),
    ).toBeVisible();
    expect(saves).toEqual([4]);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "4 Very close (4 of 5)" }).first(),
    ).toHaveAttribute("aria-pressed", "true");
    expect(saves).toEqual([4]);
    await openAccountLink(page, "My ratings");
    await expect(
      page.getByRole("heading", { level: 1, name: "My ratings" }),
    ).toBeVisible();
    await expect(page.getByText("As beef burgers ·")).toBeVisible();
    await page.getByRole("link", { name: "Edit rating", exact: true }).click();
    await page
      .getByRole("button", { name: "5 Extremely close (5 of 5)" })
      .first()
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved 5/5" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("saved-rating.png"),
      fullPage: true,
    });
    expect(saves).toEqual([4, 5]);
  } finally {
    await page.close();
    await session.dispose();
  }
});

test("rapid changes, a lost response and retry preserve one authoritative rating", async ({
  page,
  context,
}) => {
  test.skip(!!process.env.TEST_BASE_URL, "Local test-harness session.");
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/us/products/beyond-burger");
    const one = page.getByRole("button", {
      name: "1 Not close (1 of 5)",
      exact: true,
    });
    await expect(one).toBeEnabled();
    let writes = 0;
    await page.route("**/api/v1/ratings", async (route) => {
      writes++;
      if (writes === 1) {
        // The server commits, then the browser loses the response. Retry must
        // return the existing canonical record, not create another one.
        await route.fetch();
        await route.abort("failed");
      } else await route.continue();
    });
    await one.click();
    await expect(
      page.getByRole("button", { name: "Retry saving 1/5" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry saving 1/5" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved 1/5" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "2 Slightly similar (2 of 5)" })
      .click();
    await page
      .getByRole("button", { name: "5 Extremely close (5 of 5)" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved 5/5" }),
    ).toBeVisible();
    const response = await page.request.get("/api/v1/me/ratings");
    const body = await response.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].overallSimilarity).toBe(5);
  } finally {
    await page.close();
    await session.dispose();
  }
});
