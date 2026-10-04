import { isRouteErrorResponse, Links, Meta, Outlet } from "react-router";
import type { Route } from "./+types/root";
import "./styles/site.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#203b2c" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <Meta />
        <Links />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
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
