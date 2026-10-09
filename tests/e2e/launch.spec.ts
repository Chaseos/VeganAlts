import { expect, test } from "./fixtures";
import { accessible } from "./a11y";

// The desktop and 390 px mobile projects both run this.
test("policy pages are linked, readable and accessible", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "About VeganAlts" })
    .getByRole("link", { name: "How rankings work" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "How rankings work" }),
  ).toBeVisible();
  await accessible(page);
  const others = page.getByRole("navigation", { name: "Other policies" });
  await expect(
    others.getByRole("link", { name: "How rankings work" }),
  ).toHaveAttribute("aria-current", "page");
  await others.getByRole("link", { name: "Privacy" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Privacy" }),
  ).toBeVisible();
  await expect(page.getByText("Workers AI").first()).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await page.request.get("/about/unknown")).status()).toBe(404);
});

test("robots, sitemap and structured data describe only public pages", async ({
  page,
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  // Only production allows crawling; every other environment opts out.
  expect(await robots.text()).toContain("Disallow: /\n");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.headers()["content-type"]).toContain("application/xml");
  const xml = await sitemap.text();
  expect(xml).toContain("/us/ground-beef</loc>");
  expect(xml).toMatch(/\/us\/products\/[a-z0-9-]+<\/loc>/);
  expect(xml).toContain("/about/rankings</loc>");
  expect(xml).not.toMatch(/\/(api|account|admin|my-ratings|sign-in)\b/);

  await page.goto("/us/ground-beef");
  const data = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();
  const types = data.map(
    (d) => (JSON.parse(d) as { "@type": string })["@type"],
  );
  expect(types).toEqual(expect.arrayContaining(["BreadcrumbList", "ItemList"]));
  // A similarity score is not a product review, so no rating markup is emitted.
  expect(data.join("")).not.toContain("AggregateRating");
});
