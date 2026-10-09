import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
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

test("detail answers and last ate save on tap, clear on a second tap and survive a reload", async ({
  page,
  context,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Staging ratings use the owner's real accounts.",
  );
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    const drafts: Record<string, unknown>[] = [];
    page.on("request", (request) => {
      if (
        request.url().endsWith("/api/v1/ratings") &&
        request.method() === "PUT"
      )
        drafts.push(request.postDataJSON());
    });
    await page.goto("/us/products/beyond-beef");
    const form = page.getByRole("region", { name: "Rate it as beef burgers" });
    const status = form.getByRole("status");
    // Optional questions appear only once the overall score is chosen.
    await expect(form.getByRole("group", { name: "Juiciness" })).toHaveCount(0);
    await form.getByRole("button", { name: "3 Fairly close (3 of 5)" }).click();
    await expect(status).toHaveText("Saved 3/5. You’ve tried this formula.");
    await form.getByRole("button", { name: "Taste 4 of 5" }).click();
    await expect(status).toContainText("Saved 3/5 with 1 detail");
    await form.getByRole("button", { name: "Juiciness 5 of 5" }).click();
    await expect(status).toContainText("with 2 details");
    await form.getByRole("button", { name: "Taste 4 of 5" }).click();
    await expect(status).toContainText("with 1 detail");
    await form.getByRole("button", { name: "This month" }).click();
    await expect(
      form.getByRole("button", { name: "This month" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("Saved 3/5 with 1 detail");
    // Every write carries the whole draft.
    expect(drafts.at(-1)).toMatchObject({
      overallSimilarity: 3,
      dimensions: { taste: null, texture: null, juiciness: 5 },
      conventionalRecency: "within_month",
    });
    await accessible(page);

    await page.reload();
    const again = page.getByRole("region", { name: "Rate it as beef burgers" });
    await expect(
      again.getByRole("button", { name: "Juiciness 5 of 5" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      again.getByRole("button", { name: "Taste 4 of 5" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      again.getByRole("button", { name: "This month" }),
    ).toHaveAttribute("aria-pressed", "true");
    await again.getByRole("button", { name: "Clear details" }).click();
    await expect(again.getByRole("status")).toHaveText(
      "Saved 3/5. You’ve tried this formula.",
    );
    await expect(
      again.getByRole("button", { name: "This month" }),
    ).toHaveAttribute("aria-pressed", "false");
  } finally {
    await page.close();
    await session.dispose();
  }
});
