import { test as base } from "@playwright/test";

// Locally every request arrives without CF-Connecting-IP, so the whole suite
// would share one per-IP burst allowance and unrelated journeys would throttle
// each other. Each local test gets its own documentation-range address; on
// staging Cloudflare supplies the real client address.
export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    if (!process.env.TEST_BASE_URL) {
      let hash = 0;
      for (const char of `${testInfo.project.name}:${testInfo.testId}`)
        hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
      await context.setExtraHTTPHeaders({
        "CF-Connecting-IP": `198.51.100.${(hash % 250) + 1}`,
      });
    }
    await use(context);
  },
});
export { expect, type Page, type Route } from "@playwright/test";
