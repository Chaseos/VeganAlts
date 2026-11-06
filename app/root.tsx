import "./lib/zod-config";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import { PersonalStateProvider } from "./components/personal-state";
import { useContext } from "react";
import { NonceContext } from "./lib/nonce";
import { NavigationEvents } from "./components/navigation-events";
import { NavigationFeedback } from "./components/navigation-feedback";
import type { Route } from "./+types/root";
import siteStyles from "./styles/site.css?url";
import archivoFont from "./assets/fonts/archivo-latin-wdth.woff2?url";
import { THEME_COLORS, THEME_SCRIPT } from "./lib/theme";
import { LanguagePrompt } from "./components/layout/language-menu";
import { PageShell } from "./components/layout/page-shell";
import { t } from "./i18n";
import { ButtonLink } from "./components/ui/button";
import { searchPath, useSiteChrome } from "./lib/site-chrome";

export function Layout({ children }: { children: React.ReactNode }) {
  const nonce = useContext(NonceContext);
  const { language } = useSiteChrome();
  return (
    // The pre-paint script may set data-theme before React hydrates.
    <html lang={language} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content={THEME_COLORS.light}
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content={THEME_COLORS.dark}
        />
        {/* Apply a chosen theme before first paint; it carries the nonce. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
        <link
          rel="preload"
          href={archivoFont}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {/* Start the render-blocking stylesheet before framework module preloads. */}
        <link rel="stylesheet" href={siteStyles} precedence="default" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Meta />
        <Links nonce={nonce} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {t("chrome.skipToContent")}
        </a>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <PersonalStateProvider>
      <NavigationEvents />
      <NavigationFeedback />
      <LanguagePrompt />
      <Outlet />
    </PersonalStateProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { country } = useSiteChrome();
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message =
    status === 404
      ? [t("error.notFoundTitle"), t("error.notFoundBody")]
      : status === 403
        ? [t("error.forbiddenTitle"), t("error.forbiddenBody")]
        : status === 429
          ? [t("error.slowTitle"), t("error.slowBody")]
          : [t("error.failedTitle"), t("error.failedBody")];
  return (
    <PageShell width="narrow" aisles={false} minimal>
      <div className="page-heading">
        <p className="eyebrow">
          {status === 404 ? t("error.notFound") : t("error.status", { status })}
        </p>
        <h1>{message[0]}</h1>
        <p>{message[1]}</p>
      </div>
      <div className="button-row">
        {(status === 429 || status >= 500) && (
          <a className="button" href="">
            {t("error.retry")}
          </a>
        )}
        <ButtonLink to="/">{t("error.back")}</ButtonLink>
        <ButtonLink to={searchPath(country.code)} variant="secondary">
          {t("error.search")}
        </ButtonLink>
      </div>
    </PageShell>
  );
}
