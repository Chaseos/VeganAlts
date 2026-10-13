import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";
import { chooseBrand, chooseFood, openOptional } from "./site";
import { withLocalDb } from "./local-db";

test.skip(
  Boolean(process.env.TEST_BASE_URL),
  "Real staging accounts are verified interactively.",
);

test("asks for the basics first, explains what's missing and keeps the draft", async ({
  page,
  context,
}) => {
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/add-product?country=gb");
    await expect(page.getByRole("main")).toContainText(
      "Adding to United Kingdom",
    );
    // Continue is never silently disabled: it says what is missing.
    await page.getByRole("button", { name: "Continue" }).click();
    const summary = page.getByRole("alert");
    await expect(summary).toBeFocused();
    // The product's own fields wait for the food and brand (milestone 7).
    await expect(summary).toContainText("2 things to fix");
    await expect(summary.getByRole("link")).toHaveText([
      "Choose the food it replaces, or suggest a new one.",
      "Enter the brand.",
    ]);

    // The picker uses the country's names and is usable from the keyboard.
    const picker = page.getByRole("combobox", {
      name: "What food does it replace? (required)",
    });
    await picker.fill("ground");
    await expect(
      page.getByRole("option", { name: /Beef mince.*Also called/ }),
    ).toBeVisible();
    await accessible(page);
    await picker.press("ArrowDown");
    await picker.press("Enter");
    await expect(
      page.getByRole("button", { name: "Change Beef mince" }),
    ).toBeVisible();
    await expect(summary).toContainText("One thing to fix");

    // A brand that isn't listed is added as a new one, straight to the
    // product's fields.
    await chooseBrand(page, "Draft Brand");
    await expect(page.getByText("New brand", { exact: true })).toBeVisible();
    // Text survives a reload; photos are chosen again.
    await page.getByLabel("Product name (required)").fill("Draft Crumbles");
    await page.waitForTimeout(100);
    await page.reload();
    await expect(page.getByLabel("Product name (required)")).toHaveValue(
      "Draft Crumbles",
    );
    await expect(
      page.getByRole("button", { name: "Change Beef mince" }),
    ).toBeVisible();

    // An exact duplicate is pointed out before anything is sent. Beyond has
    // nothing listed in the United Kingdom, so its fields follow at once.
    await page
      .getByRole("button", { name: "Change brand Draft Brand" })
      .click();
    await chooseBrand(page, "Beyond");
    await page.getByLabel("Product name (required)").fill("Beyond Beef");
    await page.waitForTimeout(100);
    await page.goto("/add-product?country=us");
    // The unfinished product stays saved until a choice is made.
    await expect(
      page.getByText("You have an unfinished product"),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText("Beyond · Beyond Beef is saved")).toBeVisible();
    // Continuing it returns to its own country rather than moving it.
    await page.getByRole("button", { name: "Continue it" }).click();
    await expect(page).toHaveURL(/country=gb/);
    await expect(page.locator(".va-add__country")).toContainText(
      "United Kingdom",
    );
    await expect(page.getByLabel("Product name (required)")).toHaveValue(
      "Beyond Beef",
    );
    await page.waitForTimeout(100);
    await page.goto("/add-product?country=us");
    // A photo picked in the new form outlives setting the old draft aside.
    await expect(
      page.getByText("You have an unfinished product"),
    ).toBeVisible();
    await chooseBrand(page, "Kept Photo");
    await page
      .getByLabel("Front of pack photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await page.getByRole("button", { name: "Start a new one" }).click();
    await page.getByLabel("Product name (required)").fill("Kept Crumbles");
    await page.waitForTimeout(200);
    await page.reload();
    await expect(page.getByText("Selected: small.jpg")).toBeVisible();
    await page.getByRole("button", { name: "Change brand Kept Photo" }).click();
    // Change hands focus back to the brand field.
    await expect(
      page.getByRole("combobox", { name: "Brand (required)" }),
    ).toBeFocused();
    // A listed brand shows what's already listed from it, this food first.
    await chooseFood(page, "Ground Beef");
    await chooseBrand(page, "Beyond");
    const listed = page.getByRole("region", {
      name: "Already listed from Beyond",
    });
    await expect(listed).toContainText("Beyond Beef");
    await expect(
      listed.getByRole("link", {
        name: /^That’s it, rate it\s*: Beyond Beef$/,
      }),
    ).toHaveAttribute("href", /\/us\/products\/beyond-beef.*#scores-title/);
    await accessible(page);
    await listed
      .getByRole("button", { name: "Something else from Beyond" })
      .click();
    await page.getByLabel("Product name (required)").fill("Beyond Beef");
    await expect(page.getByText("Already on VeganAlts")).toBeVisible();
    await expect(page.getByRole("link", { name: "Rate it" })).toHaveAttribute(
      "href",
      /\/us\/products\/beyond-beef/,
    );
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert")).toContainText("already on VeganAlts");
  } finally {
    await page.close();
    await session.dispose();
  }
});

test("publishes a front-photo-only product with its ingredients not checked yet", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120000);
  const session = await createBrowserSession(),
    name = `Front only ${testInfo.project.name} ${Date.now()}`;
  // A fictional store members report in the United States.
  const store = {
    id: `e2e-add-${testInfo.project.name}-${Date.now()}`,
    name: `Corner Pantry ${testInfo.project.name} ${Date.now()}`,
  };
  await withLocalDb(async (db) => {
    await db.batch([
      db
        .prepare(
          "INSERT INTO retailers(id,canonical_name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
        )
        .bind(store.id, store.name, store.id, store.id),
      db
        .prepare(
          "INSERT INTO retailer_markets(retailer_id,country_id,is_active,created_at,updated_at) SELECT ?,id,1,1,1 FROM countries WHERE iso2='US'",
        )
        .bind(store.id),
    ]);
  });
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/add-product?country=us&food=bacon");
    // A food page's link arrives with its food chosen.
    await expect(
      page.getByRole("button", { name: "Change Bacon" }),
    ).toBeVisible();
    await page.getByRole("button", { name: /^Change/ }).click();
    await chooseFood(page, "Chicken Nuggets");
    await chooseBrand(page, `Plain Farm ${Date.now()}`);
    await page.getByLabel("Product name (required)").fill(name);
    await page
      .getByLabel("Front of pack photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/step=more/);
    await expect(
      page.getByRole("heading", { name: "Add more (optional)" }),
    ).toBeFocused();
    await expect(page.getByRole("main")).toContainText(
      "Everything here is optional",
    );
    await accessible(page);
    // Ratings chosen before a reload are still chosen after it; how tasty
    // it is waits for how close.
    const tasty = page.getByRole("button", { name: "5 Delicious (5 of 5)" });
    await expect(tasty).toBeDisabled();
    await page
      .getByRole("button", { name: "4 Very close (4 of 5)", exact: true })
      .click();
    await tasty.click();
    await page.waitForTimeout(100);
    // A reload keeps the picked photo too (phones often reload after the
    // camera), so step 2 stays open.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Add more (optional)" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/step=more/);
    // The form is enabled once hydrated; Back before that races hydration.
    await expect(
      page.getByRole("button", { name: "Submit product", exact: true }),
    ).toBeEnabled();
    await expect(tasty).toHaveAttribute("aria-pressed", "true");
    // Back returns to the basics with everything kept.
    await page.goBack();
    await expect(page.getByLabel("Product name (required)")).toHaveValue(name);
    await page.getByRole("button", { name: "Continue" }).click();
    // Extras: the ratings and a store, saved once the product is live.
    await expect(
      page.getByRole("button", { name: "4 Very close (4 of 5)", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await openOptional(page, "Where it’s sold");
    await page.getByText(store.name, { exact: true }).click();
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByText("Your product is live")).toBeVisible();
    await expect(page.getByText("Your 4/5 rating is saved")).toBeVisible();
    await expect(
      page.locator("#retailers").getByText(store.name, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Ingredients not checked yet").first(),
    ).toBeVisible();
    // The notice is navigation state, never part of the cached page.
    await page.reload();
    await expect(page.getByText("Your product is live")).toHaveCount(0);
    // Without a label photo the notice asks for one; with one on file it
    // asks for the ingredient check instead.
    await expect(
      page.getByRole("link", { name: "Add an ingredients photo" }),
    ).toHaveAttribute("href", /action=photo&slot=ingredients/);
    const photoId = `e2e-label-${testInfo.project.name}-${Date.now()}`;
    await withLocalDb((db) =>
      db
        .prepare(
          `INSERT INTO product_images(id,product_version_id,slot,full_r2_key,state,created_at,updated_at)
          SELECT ?,v.id,'ingredients','e2e/label.webp','accepted',1,1 FROM product_versions v JOIN products p ON p.id=v.product_id
          WHERE p.name=? AND v.is_current=1`,
        )
        .bind(photoId, name)
        .run(),
    );
    try {
      await page.reload();
      await expect(
        page.getByRole("link", { name: "Check the ingredients" }),
      ).toHaveAttribute("href", /action=change&kind=classification/);
    } finally {
      await withLocalDb((db) =>
        db.prepare("DELETE FROM product_images WHERE id=?").bind(photoId).run(),
      );
    }
  } finally {
    await page.close();
    await session.dispose();
    await withLocalDb((db) =>
      db.batch(
        [
          "DELETE FROM retailer_confirmations WHERE retailer_id=?",
          "DELETE FROM product_retailers WHERE retailer_id=?",
          "DELETE FROM retailer_markets WHERE retailer_id=?",
          "DELETE FROM retailers WHERE id=?",
        ].map((sql) => db.prepare(sql).bind(store.id)),
      ),
    );
  }
});

test("suggests a missing food inline and publishes the product once a moderator accepts it", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(180000);
  const contributor = await createBrowserSession(),
    operator = await createBrowserSession({ administrator: true });
  const stamp = `${testInfo.project.name}${Date.now().toString(36)}`;
  const food = `Bratwurst ${stamp}`,
    name = `Grill brats ${stamp}`;
  try {
    await context.addCookies([contributor.cookie]);
    await page.goto("/add-product?country=gb");
    const picker = page.getByRole("combobox", {
      name: "What food does it replace? (required)",
    });
    await picker.fill(food);
    await page
      .getByRole("option", { name: `Suggest “${food}” as a new food` })
      .click();
    await expect(
      page.getByRole("group", {
        name: "New food (reviewed with your product)",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    // The aisle is part of the basics for a new food.
    await expect(page.getByRole("alert")).toContainText(
      "Choose the aisle where you’d find it",
    );
    await page.getByLabel("Aisle (required)").selectOption({ label: "Pork" });
    await chooseBrand(page, `Grill House ${stamp}`);
    await page.getByLabel("Product name (required)").fill(name);
    await page
      .getByLabel("Front of pack photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await accessible(page);
    // A name another food already uses is refused by the server, and the
    // refusal is shown on the basics.
    const otherNames = page.getByLabel(
      "Other names (optional, separated by commas)",
    );
    await otherNames.fill("Beef mince");
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("already names a food");
    // Other names typed last and sent with Enter still travel with it.
    await otherNames.fill(`${food} links, ${stamp} sausage`);
    await otherNames.press("Enter");
    await expect(page.getByRole("main")).toContainText(
      `${food} (new food, reviewed with your product)`,
    );
    await page
      .getByRole("button", { name: "4 Very close (4 of 5)", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Thanks, your product is in review" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toContainText(
      `checks your new food “${food}” together with your product`,
    );
    await page.getByRole("link", { name: "View your submission" }).click();
    await expect(page).toHaveURL(/\/my-contributions\/submission\//);
    const receiptId = new URL(page.url()).pathname.split("/").at(-1)!;

    // The moderator decides the food; the product continues with it.
    await context.clearCookies();
    await context.addCookies([operator.cookie]);
    await page.goto(`/admin/moderation/submission/${receiptId}`);
    await expect(page.getByText("Waiting on a new food")).toBeVisible();
    await page.getByRole("link", { name: "Decide the food first" }).click();
    await expect(
      page.getByRole("heading", { name: `Suggested food: ${food}` }),
    ).toBeVisible();
    await expect(
      page.getByText("1 product is waiting on this food"),
    ).toBeVisible();
    await expect(page.getByRole("main")).toContainText(
      `Other names: ${food} links, ${stamp} sausage`,
    );
    await page
      .getByLabel("Reason and next steps")
      .fill("A distinct food with several alternatives in the UK.");
    await page.getByRole("button", { name: "Save decision" }).click();
    await expect(
      page.getByText("Status: accepted", { exact: true }),
    ).toBeVisible();
    await page.goto(`/admin/moderation/submission/${receiptId}`);
    await expect(
      page.getByText("Status: published", { exact: true }),
    ).toBeVisible();
  } finally {
    await page.close();
    await contributor.dispose();
    await operator.dispose();
  }
});

test("a failed brand lookup offers a retry, never a new brand", async ({
  page,
  context,
}) => {
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/add-product?country=us");
    await chooseFood(page, "Ground Beef");
    // While lookups fail, a misspelled listed brand is never offered as new:
    // the server would only match its exact name.
    let failing = true;
    await page.route(
      (url) => url.pathname.endsWith("/community/brands"),
      (route) => (failing ? route.abort() : route.continue()),
    );
    await page
      .getByRole("combobox", { name: "Brand (required)" })
      .fill("Impossibl");
    const retry = page.getByRole("button", { name: "Try again" });
    await expect(retry).toBeVisible();
    await expect(page.getByRole("option", { name: /new brand/ })).toHaveCount(
      0,
    );
    await accessible(page);
    failing = false;
    await retry.click();
    await expect(
      page.getByRole("option", { name: /^Impossible Foods/ }),
    ).toBeVisible();
    await expect(retry).toHaveCount(0);
  } finally {
    await page.close();
    await session.dispose();
  }
});
