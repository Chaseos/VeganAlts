import { expect, test } from "./fixtures";

// Cumulative layout shift while a page loads, hydrates and applies device
// preferences (fonts use metric-matched fallbacks; filters replace the URL).
for (const path of [
  "/",
  "/us/meat",
  "/us/ground-beef",
  "/us/products/beyond-beef",
  "/us/search?q=beef",
])
  test(`${path} stays put while it loads`, async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        })[])
          if (!entry.hadRecentInput)
            (window as unknown as { __cls: number }).__cls += entry.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(path);
    await page.waitForLoadState("load");
    await page.waitForTimeout(1200);
    const cls = await page.evaluate(
      () => (window as unknown as { __cls: number }).__cls,
    );
    expect(cls).toBeLessThan(0.1);
  });
