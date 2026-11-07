import { expect, test } from "./fixtures";
import { accessible } from "./a11y";
import { createBrowserSession } from "./session-fixture";

const PAGES = [
  ["/de/de", "de", "Deutschland"],
  ["/fr/fr", "fr", "France"],
  ["/it/it", "it", "Italia"],
  ["/at/de", "de", "Österreich"],
  ["/ch/de", "de", "Schweiz"],
  ["/ch/fr", "fr", "Suisse"],
  ["/ch/it", "it", "Svizzera"],
  ["/be/fr", "fr", "Belgique"],
  ["/lu/fr", "fr", "Luxembourg"],
  ["/lu/de", "de", "Luxemburg"],
] as const;

for (const [address, language, country] of PAGES)
  test(`${address} reads in its language and hydrates cleanly`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /hydrat/i.test(message.text()))
        errors.push(message.text());
    });
    await page.goto(address);
    await expect(page.locator("html")).toHaveAttribute("lang", language);
    await expect(page.getByRole("banner")).toContainText(country);
    await expect(page.getByRole("main")).not.toContainText("Find swaps");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
    await accessible(page);
  });

test("the same countries read in English, without those dictionaries", async ({
  page,
}) => {
  for (const code of ["de", "fr", "it", "at", "ch", "be", "lu"]) {
    const chunks: string[] = [];
    const record = (response: { url(): string }) => chunks.push(response.url());
    page.on("response", record);
    await page.goto(`/${code}/en`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("main")).toContainText("vegan");
    await page.waitForLoadState("networkidle");
    page.off("response", record);
    expect(chunks.filter((url) => /i18n\/(?:fr|ja|de|it)\b/.test(url))).toEqual(
      [],
    );
  }
});

test("a country in Europe doesn't show Canadian French", async ({ page }) => {
  await page.goto("/be/fr");
  await expect(page.getByRole("contentinfo")).not.toContainText(
    "Solutions de rechange",
  );
  await page.goto("/ca/fr");
  await expect(page.getByRole("contentinfo")).toContainText(
    "Solutions de rechange",
  );
});

test("Swiss German follows Swiss spelling", async ({ page }) => {
  await page.goto("/ch/de");
  await expect(page.locator("body")).not.toContainText("ß");
});

test("a link to a country in another language loads its text", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "The footer is the same on a phone.");
  await page.goto("/be/fr");
  // The language prompt appears after hydration, over the footer.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Pas maintenant" }).click();
  await page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Allemagne" })
    .click();
  await expect(page).toHaveURL(/\/de\/de$/);
  await expect(page.getByRole("contentinfo")).toContainText("Über");
});

test("translated pages link to a report; it reaches the digest", async ({
  page,
  context,
}) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  await page.goto("/us/en");
  await expect(
    page.getByRole("link", { name: "Report a translation problem" }),
  ).toHaveCount(0);
  const session = await createBrowserSession();
  const operator = await createBrowserSession({ administrator: true });
  try {
    await context.addCookies([session.cookie]);
    await page.goto("/at/de");
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: /Übersetzung/ })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    const quoted = `Falscher Text ${crypto.randomUUID()}`;
    await page.getByLabel(/Welcher Text/).fill(quoted);
    await page.getByRole("button", { name: /senden/i }).click();
    await expect(page.getByRole("status")).toBeVisible();
    await context.clearCookies();
    await context.addCookies([operator.cookie]);
    await page.goto("/admin/moderation/digest");
    const report = page.getByRole("article").filter({ hasText: quoted });
    await expect(report).toContainText("de-AT");
    await expect(report.getByRole("link", { name: "/at/de" })).toBeVisible();
    await report.getByLabel("What did you do?").fill("Fixed the dictionary.");
    await report.getByRole("button", { name: "Mark handled" }).click();
    await expect(report).toHaveCount(0);
  } finally {
    await session.dispose();
  }
});
