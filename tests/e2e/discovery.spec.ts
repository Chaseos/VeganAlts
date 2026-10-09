import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { signInLink } from "./site";

test("discovery, alias search, rankings and formula history are crawlable and accessible", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "What do you want to swap?",
  );
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
  await accessible(page, { extraRules: true });
  await page.screenshot({
    path: testInfo.outputPath("home.png"),
    fullPage: true,
  });
  // Enter with nothing highlighted runs the full search.
  await page
    .getByRole("combobox", { name: "Search a food or brand" })
    .fill("mince");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Results for “mince”" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: /Beyond Beef/ })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("link", { name: "Ground Beef", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Ground Beef" }),
  ).toBeVisible();
  await expect(page.getByText(/^Early · \d+ ratings?$/).first()).toBeVisible();
  expect(
    await page.locator(".va-rank-row .va-score").first().textContent(),
  ).toMatch(/\d\.\d\/5/);
  await page.screenshot({
    path: testInfo.outputPath("category.png"),
    fullPage: true,
  });
  await page
    .getByRole("main")
    .getByRole("link", { name: "Beyond Beef", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Beyond Beef" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "4 Very close (4 of 5)" }).first(),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await accessible(page, { extraRules: true });
  await page.screenshot({
    path: testInfo.outputPath("product.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", {
      name: "Illustrative development history",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Historical formula · Read only", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "4 Very close (4 of 5)" }),
  ).toHaveCount(0);
  await page.goto("/us/bacon");
  await expect(
    page
      .locator(".va-unrated")
      .filter({ hasText: "Bacon Seitan" })
      .getByRole("link", { name: /Be the first to rate/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("alternate search URLs pass through the normalized public boundary", async ({
  request,
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text()))
      hydrationErrors.push(message.text());
  });
  for (const path of [
    "/us/search/",
    "/US/search",
    "/us/se%61rch",
    "/us/search/.data",
    "/US/search.data",
    "/API/V1/search",
  ]) {
    const response = await request.get(`${path}?q=beef`);
    expect(response.status()).toBe(200);
    expect(response.headers()["x-public-cache"]).toBeTruthy();
    expect(response.headers()["cache-control"]).toBe("public, max-age=0");
    const invalid = await request.get(`${path}?q=beef&q=milk`);
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).code).toBe("INVALID_QUERY");
    expect(invalid.headers()["cache-control"]).toContain("no-store");
  }
  const path = "/US/search/?q=beef&utm_source=browser-check#products";
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Results for “beef”" }),
  ).toBeVisible();
  await expect(await signInLink(page)).toHaveAttribute(
    "href",
    `/sign-in?returnTo=${encodeURIComponent(path)}`,
  );
  expect(hydrationErrors).toEqual([]);
});

test("public HTML is session-independent apart from fresh CSP nonces; API/private boundaries hold", async ({
  request,
}) => {
  const normalize = (html: string) =>
    html.replace(/nonce="[^"]+"/g, 'nonce="DELIVERY"');
  for (const path of [
    "/",
    "/ca",
    "/us/ground-beef",
    "/us/ground-beef?view=trending",
    "/gb/ground-beef",
    "/us/products/beyond-beef",
    "/users/demo_taster_01",
  ]) {
    const anonymous = await request.get(path);
    const signed = await request.get(path, {
      headers: {
        Cookie: "better-auth.session_token=untrusted-cookie",
        Authorization: "Bearer untrusted",
      },
    });
    expect(anonymous.status()).toBe(200);
    expect(normalize(await signed.text())).toBe(
      normalize(await anonymous.text()),
    );
    expect(anonymous.headers()["cache-control"]).toBe("public, max-age=0");
    expect(anonymous.headers()["set-cookie"]).toBeUndefined();
    expect(anonymous.headers()["x-template-nonce"]).toBeUndefined();
    expect(await anonymous.text()).toContain('rel="canonical"');
  }
  const data = await request.get("/us/ground-beef.data");
  expect(data.headers()["content-type"]).not.toContain("text/html");
  const api = await request.get("/api/v1/categories/ground-beef");
  expect((await api.json()).data.ranked.length).toBeGreaterThan(0);
  const privateResponse = await request.get("/api/v1/me/rating-state");
  expect(privateResponse.headers()["cache-control"]).toContain("no-store");
  expect((await privateResponse.json()).data.user).toBeNull();
  const missing = await request.get("/us/products/missing-product");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["cache-control"]).toContain("no-store");
  const empty = await request.get("/api/v1/search?q=totallyunknownfood");
  expect((await empty.json()).data.products).toEqual([]);
});
