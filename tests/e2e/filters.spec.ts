import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { withLocalDb } from "./local-db";

test("stores narrow a ranking with OR, are saved per country and never change Top", async ({
  page,
  request,
}, testInfo) => {
  test.skip(!!process.env.TEST_BASE_URL, "Store data is arranged locally.");
  const ranked = (
    (await (await request.get("/api/v1/categories/ground-beef")).json()) as {
      data: { ranked: { id: string; name: string; topRank: number }[] };
    }
  ).data.ranked;
  expect(ranked.length).toBeGreaterThanOrEqual(2);
  const suffix = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const stores = [
    {
      id: `e2e-a-${suffix}`,
      slug: `e2e-corner-${suffix}`,
      name: `Corner Market ${suffix}`,
    },
    {
      id: `e2e-b-${suffix}`,
      slug: `e2e-greenway-${suffix}`,
      name: `Greenway ${suffix}`,
    },
  ];
  await withLocalDb(async (db) => {
    const us = await db
      .prepare("SELECT id FROM countries WHERE iso2='US'")
      .first<{ id: string }>();
    await db.batch([
      ...stores.flatMap((store) => [
        db
          .prepare(
            "INSERT INTO retailers(id,canonical_name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
          )
          .bind(store.id, store.name, store.slug, store.slug),
        db
          .prepare(
            "INSERT INTO retailer_markets(retailer_id,country_id,is_active,created_at,updated_at) VALUES(?,?,1,1,1)",
          )
          .bind(store.id, us!.id),
      ]),
      db
        .prepare(
          "INSERT INTO product_retailers(product_id,retailer_id,status,created_at,updated_at) VALUES(?,?,'active',1,1)",
        )
        .bind(ranked[0]!.id, stores[0]!.id),
      db
        .prepare(
          "INSERT INTO product_retailers(product_id,retailer_id,status,created_at,updated_at) VALUES(?,?,'active',1,1)",
        )
        .bind(ranked[1]!.id, stores[1]!.id),
      // An uncertain report never qualifies a product.
      ...(ranked[2]
        ? [
            db
              .prepare(
                "INSERT INTO product_retailers(product_id,retailer_id,status,created_at,updated_at) VALUES(?,?,'uncertain',1,1)",
              )
              .bind(ranked[2].id, stores[0]!.id),
          ]
        : []),
    ]);
  });
  try {
    await page.goto("/us/ground-beef");
    const rows = page.locator(".product-row");
    await expect(rows).toHaveCount(ranked.length);
    await page.getByLabel(/^Commonly found at: Any store/).click();
    const panel = page.getByRole("group", { name: "Stores you shop at" });
    await panel.getByLabel(new RegExp(stores[0]!.name)).check();
    await panel.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(new RegExp(`stores=${stores[0]!.slug}$`));
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(ranked[0]!.name);
    await expect(rows.first()).toContainText(
      `Commonly found at ${stores[0]!.name}`,
    );
    await accessible(page);

    // Several stores combine with OR; rows keep their overall rank.
    await page.getByLabel(/^Commonly found at: /).click();
    await page
      .getByRole("group", { name: "Stores you shop at" })
      .getByLabel(new RegExp(stores[1]!.name))
      .check();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(rows).toHaveCount(2);
    await expect(page.getByLabel(/^Commonly found at: /)).toContainText(
      `${stores[0]!.name}, ${stores[1]!.name}`,
    );

    // Long store names truncate rather than widening a phone screen.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    // The choice is saved on this device for the United States only.
    await page.goto("/us/ground-beef");
    await expect(page).toHaveURL(/stores=/);
    await expect(rows).toHaveCount(2);
    await page.goto("/ca/ground-beef");
    await expect(
      page.getByLabel(/^Commonly found at: Any store/),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/stores=/);

    await page.goto(`/us/ground-beef?stores=${stores[0]!.slug}`);
    await page.getByLabel(/^Commonly found at: /).click();
    await page.getByRole("button", { name: "Any store" }).click();
    await expect(page).not.toHaveURL(/stores=/);
    await expect(rows).toHaveCount(ranked.length);
    await page.goto("/us/ground-beef");
    await expect(
      page.getByLabel(/^Commonly found at: Any store/),
    ).toBeVisible();
    await expect(page).not.toHaveURL(/stores=/);

    // One cache variant per combination: other forms redirect.
    const messy = await request.get(
      `/us/ground-beef?stores=${stores[1]!.slug.toUpperCase()}&stores=${stores[0]!.slug}&page=2`,
      { maxRedirects: 0 },
    );
    expect(messy.status()).toBe(301);
    expect(messy.headers().location).toBe(
      `/us/ground-beef?stores=${stores[0]!.slug}%2C${stores[1]!.slug}`,
    );
    const unknown = await request.get(
      `/us/ground-beef?stores=not-a-store-${suffix}`,
      { maxRedirects: 0 },
    );
    expect(unknown.status()).toBe(302);
    expect(unknown.headers()["cache-control"]).toContain("no-store");
    const filtered = await request.get(
      `/us/ground-beef?stores=${stores[0]!.slug}`,
    );
    expect(await filtered.text()).toContain(
      'rel="canonical" href="http://127.0.0.1:5173/us/ground-beef"',
    );
  } finally {
    await withLocalDb(async (db) => {
      for (const store of stores)
        await db.batch([
          db
            .prepare("DELETE FROM product_retailers WHERE retailer_id=?")
            .bind(store.id),
          db
            .prepare("DELETE FROM retailer_markets WHERE retailer_id=?")
            .bind(store.id),
          db.prepare("DELETE FROM retailers WHERE id=?").bind(store.id),
        ]);
    });
  }
});

test("the sort menu works from the keyboard and keeps Top unchanged", async ({
  page,
}) => {
  await page.goto("/us/ground-beef");
  const top = await page.locator(".product-row h3").allTextContents();
  const sort = page.getByLabel("Sort: Closest match");
  await sort.focus();
  await page.keyboard.press("Enter");
  const trending = page
    .getByRole("group", { name: "Sort by" })
    .getByRole("link", { name: /Trending/ });
  await trending.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=trending/);
  await expect(page.getByLabel("Sort: Trending")).toBeVisible();
  // Escape closes an open menu and returns focus to it.
  await page.getByLabel("Sort: Trending").click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Sort: Trending")).toBeFocused();
  await page.goto("/us/ground-beef");
  expect(await page.locator(".product-row h3").allTextContents()).toEqual(top);
});
