import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

const MARKETS = [
  { code: "mx", language: "es", name: "México" },
  { code: "es", language: "es", name: "España" },
  { code: "br", language: "pt", name: "Brasil" },
  { code: "pt", language: "pt", name: "Portugal" },
];

for (const { code, language, name } of MARKETS) {
  test(`${name} reads in its language, and in English at its own address`, async ({
    page,
  }) => {
    await page.goto(`/${code}`);
    await expect(page).toHaveURL(new RegExp(`/${code}/${language}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.getByRole("banner")).toContainText(name);
    await expect(page.getByRole("main")).not.toContainText("Find swaps");
    await accessible(page);
    await page.goto(`/${code}/en`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await accessible(page);
  });

  test(`${name}'s dictionary loads before hydration`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto(`/${code}/${language}`);
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
}

test("Spain and Portugal show their own words over the shared language", async ({
  page,
}) => {
  await page.goto("/mx/es");
  await expect(page.locator("body")).toContainText("Agrega un producto");
  await page.goto("/es/es");
  await expect(page.locator("body")).toContainText("Añade un producto");
  await page.goto("/br/pt");
  await expect(page.locator("body")).not.toContainText("Iniciar sessão");
  await page.goto("/pt/pt");
  await expect(page.locator("body")).toContainText("Iniciar sessão");
});

test("English pages don't load the Spanish or Portuguese chunks", async ({
  page,
}) => {
  const chunks: string[] = [];
  page.on("response", (response) => chunks.push(response.url()));
  for (const path of ["/mx/en", "/es/en", "/br/en", "/pt/en"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(chunks.filter((url) => /i18n\/(?:es|pt)/.test(url))).toEqual([]);
});

test("translation reports work in Spanish and Portuguese", async ({
  page,
  context,
}) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "needs the local browser harness",
  );
  await context.addCookies([(await createBrowserSession()).cookie]);
  for (const [code, language, word] of [
    ["mx", "es", "traducción"],
    ["pt", "pt", "tradução"],
  ] as const) {
    await page.goto(`/${code}/${language}`);
    // On phones the language prompt can sit over the footer.
    const link = page
      .getByRole("contentinfo")
      .getByRole("link", { name: word });
    await page.goto((await link.getAttribute("href"))!);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(word);
    await accessible(page);
  }
});

test("a food page is named in the market's own word", async ({ page }) => {
  for (const [path, word] of [
    ["/mx/es/yogurt", "yogurt"],
    ["/es/es/yogurt", "yogur"],
    ["/br/pt/ice-cream", "sorvete"],
    ["/pt/pt/ice-cream", "gelado"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      `“${word}”`,
    );
  }
});
