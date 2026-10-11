import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";
import { chooseFood, fillBasics, openOptional } from "./site";
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
    await expect(summary).toContainText("4 things to fix");
    await expect(summary.getByRole("link")).toHaveText([
      "Choose the food it replaces, or suggest a new one.",
      "Enter the brand.",
      "Enter the product name.",
      "Add a photo of the front of the package.",
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
    await expect(summary).toContainText("3 things to fix");

    // Text survives a reload; photos are chosen again.
    await page.getByLabel("Brand (required)").fill("Draft Brand");
    await page.getByLabel("Product name (required)").fill("Draft Crumbles");
    await page.waitForTimeout(100);
    await page.reload();
    await expect(page.getByLabel("Product name (required)")).toHaveValue(
      "Draft Crumbles",
    );
    await expect(
      page.getByRole("button", { name: "Change Beef mince" }),
    ).toBeVisible();

    // An exact duplicate is pointed out before anything is sent.
    await page.getByLabel("Brand (required)").fill("Beyond");
    await page.getByLabel("Product name (required)").fill("Beyond Beef");
    await page.waitForTimeout(100);
    await page.goto("/add-product?country=us");
    // The unfinished product stays saved until a choice is made.
    await expect(
      page.getByText("You have an unfinished product"),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText("Beyond · Beyond Beef is saved")).toBeVisible();
    await page.getByRole("button", { name: "Start a new one" }).click();
    await fillBasics(page, {
      food: "Ground Beef",
      brand: "Beyond",
      name: "Beyond Beef",
    });
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
    await page.getByLabel("Brand (required)").fill(`Plain Farm ${Date.now()}`);
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
    // Back returns to the basics with everything kept.
    await page.goBack();
    await expect(page.getByLabel("Product name (required)")).toHaveValue(name);
    await page.getByRole("button", { name: "Continue" }).click();
    // Extras: a rating and a store, saved once the product is live.
    await page.getByRole("button", { name: "4 Very close (4 of 5)" }).click();
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
    // The shelf is part of the basics for a new food.
    await expect(page.getByRole("alert")).toContainText(
      "Choose the shelf where you’d find it",
    );
    await page
      .getByLabel("Shelf (required)")
      .selectOption({ label: "Meat › Pork" });
    await page.getByLabel("Brand (required)").fill(`Grill House ${stamp}`);
    await page.getByLabel("Product name (required)").fill(name);
    await page
      .getByLabel("Front of pack photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await accessible(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("main")).toContainText(
      `${food} (new food, reviewed with your product)`,
    );
    await page.getByRole("button", { name: "4 Very close (4 of 5)" }).click();
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
