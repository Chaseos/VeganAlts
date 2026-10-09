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
import type { Route } from "./+types/root";
import siteStyles from "./styles/site.css?url";
import archivoFont from "./assets/fonts/archivo-latin-wdth.woff2?url";
import { THEME_COLORS, THEME_SCRIPT } from "./lib/theme";
import { PageShell } from "./components/layout/page-shell";
import { ButtonLink } from "./components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const nonce = useContext(NonceContext);
  return (
    // The pre-paint script may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
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
          Skip to content
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
      <Outlet />
    </PersonalStateProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const message =
    status === 404
      ? [
          "This page isn’t here.",
          "The link may have changed. Let’s get you back home.",
        ]
      : status === 403
        ? [
            "Access isn’t available.",
            "Your account does not have permission to use this page.",
          ]
        : status === 429
          ? ["Please slow down.", "Wait a moment before trying again."]
          : ["Something went wrong.", "Please try again in a moment."];
  return (
    <PageShell width="narrow" aisles={false} minimal>
      <div className="page-heading">
        <p className="eyebrow">
          {status === 404 ? "Not found" : `Error ${status}`}
        </p>
        <h1>{message[0]}</h1>
        <p>{message[1]}</p>
      </div>
      <div className="button-row">
        <ButtonLink to="/">Back to VeganAlts</ButtonLink>
        <ButtonLink to="/us/search" variant="secondary">
          Search foods
        </ButtonLink>
      </div>
    </PageShell>
  );
}
