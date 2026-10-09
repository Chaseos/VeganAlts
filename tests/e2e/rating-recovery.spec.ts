import { expect, test, type Route } from "./fixtures";
import { createBrowserSession } from "./session-fixture";
import { expectSignedIn, signInLink } from "./site";

test("reauthentication saves the latest score selected during an expired in-flight request", async ({
  page,
  context,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Session/provider simulation is local only.",
  );
  const session = await createBrowserSession();
  try {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text()))
        hydrationErrors.push(message.text());
    });
    await context.addCookies([session.cookie]);
    await page.goto("/us/products/beyond-burger");
    await expectSignedIn(page);
    let receiveRequest!: (route: Route) => void;
    const firstRequest = new Promise<Route>((resolve) => {
      receiveRequest = resolve;
    });
    await page.route("**/api/v1/ratings", (route) => receiveRequest(route));
    await page
      .getByRole("button", { name: "2 Slightly similar (2 of 5)" })
      .click();
    const inFlight = await firstRequest;
    expect(inFlight.request().postDataJSON().overallSimilarity).toBe(2);
    await page.getByRole("button", { name: "3 Fairly close (3 of 5)" }).click();
    await page
      .getByRole("button", { name: "5 Extremely close (5 of 5)" })
      .click();
    await expect(
      page.getByRole("button", { name: "5 Extremely close (5 of 5)" }),
    ).toHaveAttribute("aria-pressed", "true");
    await context.clearCookies();
    await inFlight.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({
        code: "UNAUTHENTICATED",
        title: "Sign in to save your rating.",
      }),
    });
    await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    await page.unroute("**/api/v1/ratings");
    const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
    await context.addCookies([session.cookie]);
    await page.goto(`/auth/return?returnTo=${encodeURIComponent(returnTo)}`);
    await expect(
      page.getByRole("status").filter({ hasText: "Saved 5/5" }),
    ).toBeVisible();
    const ratings = await (await page.request.get("/api/v1/me/ratings")).json();
    expect(ratings.data).toHaveLength(1);
    expect(ratings.data[0].overallSimilarity).toBe(5);
    expect(hydrationErrors).toEqual([]);
  } finally {
    await page.close();
    await session.dispose();
  }
});

test("session loss and a cancelled sign-in retain the score for a later successful return", async ({
  page,
  context,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Session/provider simulation is local only.",
  );
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/us/products/beyond-burger");
    await expectSignedIn(page);
    await context.clearCookies();
    await page
      .getByRole("button", { name: "2 Slightly similar (2 of 5)" })
      .click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
    await page.goto(
      `/sign-in?error=cancelled&returnTo=${encodeURIComponent(returnTo)}`,
    );
    await expect(page.getByRole("alert")).toContainText(
      "Sign-in did not finish",
    );
    await page.getByRole("link", { name: "Continue browsing →" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Beyond Burger" }),
    ).toBeVisible();
    await expect(await signInLink(page)).toHaveAttribute(
      "href",
      `/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
    );
    await context.addCookies([session.cookie]);
    await page.goto(`/auth/return?returnTo=${encodeURIComponent(returnTo)}`);
    await expect(
      // A pending personal-state fetch can observe the restored cookie and save
      // before this navigation. Either confirmation must show the same persisted score.
      page
        .getByRole("status")
        .filter({ hasText: /(?:Saved|Your rating:) 2\/5/ }),
    ).toBeVisible();
    const ratings = await (await page.request.get("/api/v1/me/ratings")).json();
    expect(ratings.data).toHaveLength(1);
    expect(ratings.data[0].overallSimilarity).toBe(2);
  } finally {
    await page.close();
    await session.dispose();
  }
});

test("a formula conflict after sign-in requires a fresh selection", async ({
  page,
  context,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Provider and conflict simulation is local only.",
  );
  const session = await createBrowserSession();
  try {
    await page.goto("/us/products/beyond-burger");
    await page.getByRole("button", { name: "3 Fairly close (3 of 5)" }).click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
    await context.addCookies([session.cookie]);
    await page.route("**/api/v1/ratings", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/problem+json",
        body: JSON.stringify({
          code: "NOT_RATEABLE",
          title: "This formula has changed. Choose the current formula.",
        }),
      }),
    );
    await page.goto(`/auth/return?returnTo=${encodeURIComponent(returnTo)}`);
    await expect(
      page.getByRole("complementary", { name: "Your pending rating" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "3 Fairly close (3 of 5)" }),
    ).toBeDisabled();
    const saved = await page.request.get("/api/v1/me/ratings");
    expect((await saved.json()).data).toEqual([]);
    await page.unroute("**/api/v1/ratings");
    await page
      .getByRole("link", {
        name: "Open the current formula and choose a fresh score →",
      })
      .click();
    await expect(
      page.getByRole("button", { name: "4 Very close (4 of 5)" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("complementary", { name: "Your pending rating" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "4 Very close (4 of 5)" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved 4/5" }),
    ).toBeVisible();
  } finally {
    await page.close();
    await session.dispose();
  }
});

test("rate limits and an unavailable security check preserve a recoverable selection", async ({
  page,
  context,
}) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Abuse-response simulation is local only.",
  );
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.route("https://challenges.cloudflare.com/**", (route) =>
      route.abort("failed"),
    );
    await page.goto("/us/products/beyond-burger");
    let challenge = false;
    await page.route("**/api/v1/ratings", (route) =>
      route.fulfill({
        status: challenge ? 403 : 429,
        contentType: "application/problem+json",
        body: JSON.stringify({
          code: challenge ? "CHALLENGE_REQUIRED" : "RATE_LIMITED",
          title: challenge
            ? "Complete the security check to save."
            : "Please wait a minute before saving again.",
        }),
      }),
    );
    await page
      .getByRole("button", { name: "2 Slightly similar (2 of 5)" })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Please wait a minute" }),
    ).toBeVisible();
    const retry = page.getByRole("button", { name: "Retry saving 2/5" });
    await expect(retry).toBeEnabled();
    challenge = true;
    await retry.click();
    await expect(page.getByRole("alert")).toContainText(
      "The security check could not load",
    );
    await expect(retry).toBeDisabled();
    await page.unroute("**/api/v1/ratings");
    await page.getByRole("button", { name: "4 Very close (4 of 5)" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Saved 4/5" }),
    ).toBeVisible();
  } finally {
    await page.close();
    await session.dispose();
  }
});
