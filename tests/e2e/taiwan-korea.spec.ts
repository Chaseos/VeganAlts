import { SEARCH_INDEX_STATEMENTS } from "../../server/catalog/infrastructure/search-index";
import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { withLocalDb } from "./local-db";

const MARKETS = [
  {
    home: "/tw",
    language: "zh",
    tag: "zh-TW",
    country: "台灣",
    iso2: "TW",
    query: "牛奶",
  },
  {
    home: "/kr",
    language: "ko",
    tag: "ko",
    country: "대한민국",
    iso2: "KR",
    query: "우유를",
  },
];

// New countries start with no foods, so a search needs one switched on.
const switchOn = (on: boolean) =>
  withLocalDb(async (db) => {
    const countries = "(SELECT id FROM countries WHERE iso2 IN ('TW','KR'))";
    const milk = "(SELECT id FROM categories WHERE slug='milk')";
    await db.batch([
      db.prepare(
        on
          ? `INSERT OR IGNORE INTO category_countries(category_id,country_id,source,created_at)
             SELECT ${milk},id,'launch',1 FROM countries WHERE iso2 IN ('TW','KR')`
          : `DELETE FROM category_countries WHERE category_id=${milk} AND country_id IN ${countries}`,
      ),
      ...SEARCH_INDEX_STATEMENTS.map((sql) => db.prepare(sql)),
    ]);
  });

test.beforeAll(() => switchOn(true));
test.afterAll(() => switchOn(false));

for (const { home, language, tag, country, iso2, query } of MARKETS) {
  test(`${iso2} reads in its language, and in English at its own address`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto(home);
    await expect(page).toHaveURL(new RegExp(`${home}/${language}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", tag);
    await expect(page.getByRole("banner")).toContainText(country);
    await accessible(page);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });

  test(`${iso2} in English doesn't load its dictionary`, async ({ page }) => {
    const loaded: string[] = [];
    page.on("request", (request) => loaded.push(request.url()));
    await page.goto(`${home}/en`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect(loaded.filter((url) => /i18n\/(zh|ko)/.test(url))).toEqual([]);
    await accessible(page);
  });

  test(`${iso2} search finds a food by its local name`, async ({ page }) => {
    await page.goto(
      `${home}/${language}/search?q=${encodeURIComponent(query)}`,
    );
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /牛奶|우유/ })
        .first(),
    ).toBeVisible();
    await accessible(page);
  });
}
