import { expect, test } from "./fixtures";
import { createBrowserSession } from "./session-fixture";

test("submission renews consumed and rejected challenges across preflight, upload and finalization", async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Provider simulation is local only.",
  );
  const session = await createBrowserSession();
  const usedTokens: string[] = [],
    acceptedPaths: string[] = [];
  const keys = new Map<string, Set<string>>();
  try {
    await context.addCookies([session.cookie]);
    await page.addInitScript(() => {
      let renders = 0;
      const widgets = new Map<string, HTMLButtonElement>();
      window.turnstile = {
        render(element, options) {
          const id = String(++renders);
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = `Complete test security check ${id}`;
          button.onclick = () => {
            button.disabled = true;
            options.callback(`local-test-token-${id}`);
          };
          widgets.set(id, button);
          element.appendChild(button);
          return id;
        },
        remove(id) {
          widgets.get(id)?.remove();
          widgets.delete(id);
        },
      };
    });
    await page.route(
      /\/api\/v1\/submissions\/(preflight|[^/]+\/(uploads|finalize))$/,
      async (route) => {
        const request = route.request(),
          headers = { ...request.headers() };
        const token = headers["x-turnstile-token"];
        const path = new URL(request.url()).pathname;
        const attempts = keys.get(path) ?? new Set<string>();
        attempts.add(headers["idempotency-key"]!);
        keys.set(path, attempts);
        if (token) usedTokens.push(token);
        // Require a new solve for every protected operation, and reject the
        // first solved token to exercise recovery without a page reload.
        if (!token || usedTokens.length === 1) {
          await route.fulfill({
            status: 403,
            contentType: "application/problem+json",
            body: JSON.stringify({
              code: "CHALLENGE_REQUIRED",
              title: "Complete the security check and retry.",
            }),
          });
          return;
        }
        expect(new Set(usedTokens).size).toBe(usedTokens.length);
        delete headers["x-turnstile-token"];
        acceptedPaths.push(path);
        // The local request still uses the real session, validation, storage
        // and publication services. Provider verification is tested separately.
        await route.continue({ headers });
      },
    );
    const name = `Challenge ${testInfo.project.name} ${Date.now()}`;
    await page.goto("/add-product");
    await page.getByLabel("Product name", { exact: true }).fill(name);
    await page
      .getByLabel("Brand", { exact: true })
      .fill(`Challenge Garden ${Date.now()}`);
    await page.getByLabel("Beef Burgers", { exact: true }).check();
    await page.getByRole("button", { name: "Check for matches" }).click();
    await page.getByRole("button", { name: "Add evidence" }).click();
    await page
      .getByLabel("Front photo (required)")
      .setInputFiles("tests/fixtures/small.jpg");
    await page
      .getByLabel(/Manufacturer ingredient source/)
      .fill("https://example.com/ingredients");
    await page
      .getByLabel("What supports the ingredient classification?")
      .fill("The manufacturer ingredient source lists only plant ingredients.");
    await page.getByRole("button", { name: "Review submission" }).click();
    await page
      .getByRole("button", { name: "Submit product", exact: true })
      .click();
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(page.getByRole("alert")).toContainText(
        "Complete the security check",
      );
      await page
        .getByRole("button", {
          name: `Complete test security check ${attempt}`,
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: /^(Submit product|Resume submission)$/ })
        .click();
    }
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    expect(usedTokens).toHaveLength(4);
    expect(acceptedPaths.map((path) => path.split("/").at(-1))).toEqual([
      "preflight",
      "uploads",
      "finalize",
    ]);
    expect([...keys.values()].map((attempts) => attempts.size)).toEqual([
      1, 1, 1,
    ]);
  } finally {
    await page.close();
    await session.dispose();
  }
});
