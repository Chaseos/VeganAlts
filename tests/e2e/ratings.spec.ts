import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { openAccountLink } from "./site";
import { createBrowserSession } from "./session-fixture";

test("anonymous selection resumes once after sign-in and My Ratings edits the same nondefault food", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !!process.env.TEST_BASE_URL,
    "Real staging provider returns are verified interactively; simulation is local only.",
  );
  const session = await createBrowserSession();
  try {
    await page.goto("/us/ground-beef");
    await page
      .getByRole("main")
      .getByRole("link", { name: "Beyond Beef", exact: true })
      .first()
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
      .getByRole("button", { name: "4 Very close (4 of 5)", exact: true })
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
      page
        .getByRole("button", { name: "4 Very close (4 of 5)", exact: true })
        .first(),
    ).toHaveAttribute("aria-pressed", "true");
    expect(saves).toEqual([4]);
    await openAccountLink(page, "My ratings");
    await expect(
      page.getByRole("heading", { level: 1, name: "My ratings" }),
    ).toBeVisible();
    await expect(page.getByText("As ground beef ·")).toBeVisible();
    await page.getByRole("link", { name: "Edit rating", exact: true }).click();
    await expect(page).toHaveURL(
      /\/products\/beyond-beef\?food=ground-beef#rate-/,
    );
    await expect(
      page
        .getByRole("button", { name: "4 Very close (4 of 5)", exact: true })
        .first(),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "5 Extremely close (5 of 5)", exact: true })
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
    const response = await page.request.get("/api/v1/me/ratings");
    expect((await response.json()).data).toMatchObject([
      { categorySlug: "ground-beef", overallSimilarity: 5 },
    ]);
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
      .getByRole("button", { name: "2 Slightly similar (2 of 5)", exact: true })
      .click();
    await page
      .getByRole("button", { name: "5 Extremely close (5 of 5)", exact: true })
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
    await form
      .getByRole("button", { name: "3 Fairly close (3 of 5)", exact: true })
      .click();
    await expect(status).toHaveText("Saved 3/5. You’ve tried this formula.");
    const details = form.locator(".va-rate__more");
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").press("Enter");
    await expect(details).toHaveAttribute("open", "");
    for (const scale of await form.locator(".va-numbered-scale").all())
      await expect(scale.locator(".va-rate__number")).toHaveText([
        "1",
        "2",
        "3",
        "4",
        "5",
      ]);
    await form
      .getByRole("button", { name: "Taste: 4 Very close (4 of 5)" })
      .click();
    await expect(status).toContainText("Saved 3/5 with 1 detail");
    await form
      .getByRole("button", { name: "Juiciness: 5 Extremely close (5 of 5)" })
      .click();
    await expect(status).toContainText("with 2 details");
    await form
      .getByRole("button", { name: "Taste: 4 Very close (4 of 5)" })
      .click();
    await expect(status).toContainText("with 1 detail");
    await form.getByRole("button", { name: "This month" }).click();
    await expect(
      form.getByRole("button", { name: "This month" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("Saved 3/5 with 1 detail");
    // Tastiest is answered beside it and saves on tap.
    await form.getByRole("button", { name: "5 Delicious (5 of 5)" }).click();
    await expect(
      form.getByRole("button", { name: "5 Delicious (5 of 5)" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(status).toContainText("Saved 3/5");
    // Every write carries the whole draft.
    expect(drafts.at(-1)).toMatchObject({
      overallSimilarity: 3,
      dimensions: { taste: null, texture: null, juiciness: 5 },
      conventionalRecency: "within_month",
      enjoyment: 5,
    });
    await accessible(page, { extraRules: true });

    await page.reload();
    const again = page.getByRole("region", { name: "Rate it as beef burgers" });
    await expect(again.locator(".va-rate__more summary")).toContainText(
      "your answers",
    );
    await again.locator(".va-rate__more summary").click();
    await expect(
      again.getByRole("button", {
        name: "Juiciness: 5 Extremely close (5 of 5)",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      again.getByRole("button", { name: "Taste: 4 Very close (4 of 5)" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(
      again.getByRole("button", { name: "This month" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Tapping the chosen Tastiest answer again clears it.
    const delicious = again.getByRole("button", {
      name: "5 Delicious (5 of 5)",
    });
    await expect(delicious).toHaveAttribute("aria-pressed", "true");
    await delicious.click();
    await expect(delicious).toHaveAttribute("aria-pressed", "false");
    await expect(again.getByRole("status")).toContainText("Saved 3/5");
    expect(drafts.at(-1)).toMatchObject({ enjoyment: null });
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

test("taste can be rated first, survives sign-in, and clears independently of closeness", async ({
  page,
  context,
}) => {
  test.skip(!!process.env.TEST_BASE_URL, "Provider simulation is local only.");
  const session = await createBrowserSession();
  try {
    await page.goto("/us/products/beyond-burger?food=beef-burgers");
    const editor = page.getByRole("region", {
      name: "Rate it as beef burgers",
    });
    const taste = editor.getByRole("button", {
      name: "5 Delicious (5 of 5)",
      exact: true,
    });
    await expect(taste).toBeEnabled();
    await expect(editor).not.toContainText("Say how close it is first");
    await expect(editor.locator(".va-rate__tasty legend")).not.toContainText(
      "optional",
    );
    await taste.click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
    const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
    await context.addCookies([session.cookie]);
    await page.goto(`/auth/return?returnTo=${encodeURIComponent(returnTo)}`);
    await expect(editor.getByRole("status")).toContainText("Saved taste 5/5");
    await page.reload();
    await expect(taste).toHaveAttribute("aria-pressed", "true");
    const saved = await (await page.request.get("/api/v1/me/ratings")).json();
    expect(saved.data).toMatchObject([
      { overallSimilarity: null, enjoyment: 5 },
    ]);
    await openAccountLink(page, "My ratings");
    await expect(page.getByText("Taste: 5, Delicious")).toBeVisible();
    await expect(page.getByText("Closeness:")).toHaveCount(0);
    await page.getByRole("link", { name: "Edit rating", exact: true }).click();
    const close = editor.getByRole("button", {
      name: "3 Fairly close (3 of 5)",
      exact: true,
    });
    await close.click();
    await expect(editor.getByRole("status")).toContainText(
      "Saved 3/5; taste 5/5",
    );
    await close.click();
    await expect(editor.getByRole("status")).toContainText("Saved taste 5/5");
    await taste.click();
    await expect(editor.getByRole("status")).toHaveText(
      "Rating removed. You’ve tried this formula.",
    );
    expect(
      (await (await page.request.get("/api/v1/me/ratings")).json()).data,
    ).toEqual([]);
    await page.reload();
    await expect(taste).toHaveAttribute("aria-pressed", "false");
    await expect(close).toHaveAttribute("aria-pressed", "false");
    await accessible(page);
  } finally {
    await page.close();
    await session.dispose();
  }
});
