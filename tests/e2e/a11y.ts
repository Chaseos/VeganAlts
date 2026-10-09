import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "./fixtures";

// axe in both themes, plus the layout and content-security checks every
// redesigned page must pass: no horizontal scrolling at the current width and
// no inline styles (the production policy blocks them).
export async function accessible(
  page: Page,
  { extraRules = false }: { extraRules?: boolean } = {},
) {
  for (const colorScheme of ["light", "dark"] as const) {
    // Reduced motion removes transitions, so axe never samples a color mid-fade.
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const builder = new AxeBuilder({ page });
    if (extraRules)
      builder.options({
        rules: { "label-content-name-mismatch": { enabled: true } },
      });
    expect(
      (await builder.analyze()).violations,
      `${colorScheme} theme`,
    ).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null, reducedMotion: null });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "no horizontal scroll",
  ).toBe(true);
  expect(
    await page.evaluate(() => ({
      styled: document.querySelectorAll("body [style]").length,
      blocks: document.querySelectorAll("style").length,
    })),
    "no inline styles",
  ).toEqual({ styled: 0, blocks: 0 });
}
