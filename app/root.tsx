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

export function Layout({ children }: { children: React.ReactNode }) {
  const nonce = useContext(NonceContext);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#203b2c" />
        {/* Start the render-blocking stylesheet before framework module preloads. */}
        <link rel="stylesheet" href={siteStyles} precedence="default" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
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
    <main id="main" className="message-page">
      <a className="wordmark" href="/">
        VeganAlts<span aria-hidden="true">.</span>
      </a>
      <h1>{message[0]}</h1>
      <p>{message[1]}</p>
      <a className="button" href="/">
        Back to VeganAlts
      </a>
    </main>
  );
}
