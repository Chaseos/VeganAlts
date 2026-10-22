import { expect, test, type Route } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

for (const delayed of ["next", "previous"] as const) {
  test(`suggested changes stay with their product when the ${delayed} product's response is delayed`, async ({
    page,
  }) => {
    test.skip(Boolean(process.env.TEST_BASE_URL), "Local request simulation.");
    await page.route("**/api/v1/me/rating-state?**", (route) =>
      route.fulfill({
        json: {
          data: {
            user: {
              handle: "proposal_navigation",
              displayName: null,
              administrator: false,
            },
            ratings: [],
            triedVersionIds: [],
            turnstileSiteKey: null,
          },
        },
      }),
    );
    let originalProductId = "",
      nextProductId = "",
      releaseResponses = false,
      receiveRequest!: (route: Route) => void;
    const pending = new Promise<Route>((resolve) => {
      receiveRequest = resolve;
    });
    const writes: string[] = [];
    const heldRoutes: Route[] = [];
    const proposal = (productId: string) => ({
      id: `navigation-${productId}`,
      summary:
        productId === originalProductId ? "Original change" : "Full Fat change",
      tier: 2,
      note: "Check the package name.",
      own: false,
      stance: writes.includes(`navigation-${productId}`) ? "confirm" : null,
      confirms: 0,
      disagrees: 0,
      evidence: 0,
      evidenceUrls: [],
      evidenceReceiptId: null,
      imageIds: [],
    });
    await page.route(
      "**/api/v1/community/products/*/proposals",
      async (route) => {
        const productId = new URL(route.request().url()).pathname
          .split("/")
          .at(-2)!;
        originalProductId ||= productId;
        if (productId !== originalProductId) nextProductId = productId;
        if (
          !releaseResponses &&
          (delayed === "previous") === (productId === originalProductId)
        ) {
          heldRoutes.push(route);
          receiveRequest(route);
          return;
        }
        await route.fulfill({ json: { data: [proposal(productId)] } });
      },
    );
    await page.route("**/api/v1/proposals/*/responses", async (route) => {
      writes.push(new URL(route.request().url()).pathname.split("/").at(-2)!);
      await route.fulfill({ json: { data: { saved: true } } });
    });
    await page.goto("/us/products/oatly-original");
    const panel = page.getByRole("region", { name: "Suggested changes" });
    if (delayed === "next") {
      await expect(
        panel.getByText("Original change", { exact: true }),
      ).toBeVisible();
      await panel
        .getByRole("button", { name: "Disagree", exact: true })
        .click();
      await panel
        .getByLabel("What is wrong with this change?")
        .fill("Original product note");
    } else {
      await pending;
    }
    await page
      .locator(".va-product__flavor-link")
      .filter({ hasText: "Full Fat" })
      .click();
    await expect(page).toHaveURL(/\/products\/oatly-full-fat/);
    const held = await pending;
    if (delayed === "next") {
      await expect(panel).toHaveCount(0);
      expect(writes).toEqual([]);
    } else {
      await expect(
        panel.getByText("Full Fat change", { exact: true }),
      ).toBeVisible();
    }
    releaseResponses = true;
    await Promise.all(
      heldRoutes.map((route) =>
        route.fulfill({
          json: {
            data: [
              proposal(delayed === "next" ? nextProductId : originalProductId),
            ],
          },
        }),
      ),
    );
    if (delayed === "previous") {
      await expect.poll(() => held.request().failure()).not.toBeNull();
    }
    await expect(
      panel.getByText("Full Fat change", { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText("Original change", { exact: true }),
    ).toHaveCount(0);
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel.getByRole("status")).toBeEmpty();
    await panel.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(panel.getByRole("status")).toContainText(
      "confirmation is recorded",
    );
    expect(writes).toEqual([`navigation-${nextProductId}`]);
    await expect(
      panel.getByRole("button", { name: "Confirm", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
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

test("an allergen declaration is proposed from the country's list and shown for review", async ({
  page,
  context,
}) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  const proposer = await createBrowserSession();
  try {
    await context.addCookies([proposer.cookie]);
    await page.goto("/us/products/beyond-burger");
    await page.getByRole("link", { name: "Suggest a change" }).click();
    await expect(page.getByLabel("What changed?")).toBeEnabled();
    await page.getByLabel("What changed?").selectOption("allergens");
    await expect(page.getByText("Always check the package.")).toBeVisible();
    await page.getByRole("radio", { name: "It lists allergens" }).check();
    const contains = page.getByRole("group", { name: "Contains" });
    const may = page.getByRole("group", { name: "May contain" });
    await may.getByRole("checkbox", { name: "Soy" }).check();
    // Checking it as contained moves it out of "may contain".
    await contains.getByRole("checkbox", { name: "Soy" }).check();
    await expect(may.getByRole("checkbox", { name: "Soy" })).not.toBeChecked();
    await may.getByRole("checkbox", { name: "Sesame" }).check();
    await page
      .getByLabel("What does the evidence show?")
      .fill("The allergen statement under the ingredients lists these.");
    await accessible(page);
    await page
      .getByRole("button", { name: "Submit proposal for review" })
      .click();
    await expect(
      page.getByText("Status: pending", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        /Allergens on the label: Contains soy · may contain sesame/,
      ),
    ).toBeVisible();
  } finally {
    await page.close();
    await proposer.dispose();
  }
});
