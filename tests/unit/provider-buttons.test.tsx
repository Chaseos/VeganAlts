import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { ProviderButton } from "../../app/components/auth/provider-button";

it("keeps branded providers as native submit buttons, including the challenge-disabled state", () => {
  for (const provider of ["google", "apple"] as const) {
    const markup = renderToStaticMarkup(
      <ProviderButton provider={provider} disabled={false} />,
    );
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('name="provider"');
    expect(markup).toContain(`value="${provider}"`);
    expect(markup).toContain(
      `Continue with ${provider === "google" ? "Google" : "Apple"}`,
    );
    expect(markup).not.toContain("https://");
    expect(
      renderToStaticMarkup(<ProviderButton provider={provider} disabled />),
    ).toContain('disabled=""');
  }
});

// Optional local visual fixture for providers that aren't configured in .dev.vars.
// It renders the real component and stylesheet, and never starts OAuth.
if (process.env.CAPTURE) {
  const directory = "test-results/captures/ux-refinements-2026-10-13";
  mkdirSync(directory, { recursive: true });
  for (const theme of ["light", "dark"]) {
    const markup = renderToStaticMarkup(
      <html lang="en" data-theme={theme}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Sign-in button preview · VeganAlts</title>
          <link rel="stylesheet" href="/app/styles/site.css?direct" />
        </head>
        <body>
          <main className="va-main va-main--narrow">
            <header className="page-heading">
              <h1>Sign in to VeganAlts</h1>
              <p>
                Keep track of what you’ve tried and help others find a closer
                alternative.
              </p>
            </header>
            <section
              className="va-card va-sign-in"
              aria-label="Sign-in options"
            >
              <form
                className="va-sign-in__providers"
                action="/sign-in"
                method="post"
              >
                <ProviderButton provider="google" disabled={false} />
                <ProviderButton provider="apple" disabled={false} />
              </form>
              <a className="text-link" href="/">
                Continue browsing →
              </a>
            </section>
          </main>
        </body>
      </html>,
    );
    writeFileSync(
      `${directory}/sign-in-${theme}.html`,
      `<!DOCTYPE html>${markup}`,
    );
  }
}
