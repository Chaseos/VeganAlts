import { env } from "cloudflare:workers";
import { Form, Link, data, redirect } from "react-router";
import { useState } from "react";
import { configuredProviders, getAuth } from "@server/auth/infrastructure/auth";
import { requireSameOrigin } from "@server/shared/http/security";
import { limitedFormData } from "@server/shared/http/limited-form";
import { safeReturnDestination } from "@server/auth/domain/return-destination";
import { ApplicationError } from "@server/shared/domain/errors";
import { protectContribution } from "@server/abuse/service";
import { recordEvent } from "@server/observability/events";
import { PageShell } from "../components/layout/page-shell";
import { Turnstile } from "../components/turnstile";
import type { Route } from "./+types/sign-in";

export function loader({ request }: Route.LoaderArgs) {
  return {
    providers: configuredProviders(env),
    staging: env.APP_ENV !== "production",
    failed: new URL(request.url).searchParams.has("error"),
    returnTo: safeReturnDestination(
      new URL(request.url).searchParams.get("returnTo"),
      env.APP_URL,
    ),
    siteKey: env.TURNSTILE_SITE_KEY || null,
  };
}
export function meta() {
  return [
    { title: "Sign in · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request, env.APP_URL);
  const form = await limitedFormData(request, 8 * 1024);
  const provider = form.get("provider");
  const returnTo = safeReturnDestination(form.get("returnTo"), env.APP_URL);
  try {
    await protectContribution(
      request,
      env,
      "sign-in",
      "anonymous",
      String(form.get("challengeToken") ?? "") || undefined,
    );
  } catch (error) {
    if (error instanceof ApplicationError)
      return data(
        {
          error: error.message,
          challengeRequired: error.code === "CHALLENGE_REQUIRED",
        },
        { status: error.status },
      );
    throw error;
  }
  if (
    (provider !== "google" && provider !== "apple") ||
    !configuredProviders(env).includes(provider)
  ) {
    return data(
      { error: "This sign-in option is not available yet." },
      { status: 503 },
    );
  }
  const auth = await getAuth(env);
  const response = await auth.api.signInSocial({
    headers: request.headers,
    asResponse: true,
    body: {
      provider,
      callbackURL: `${env.APP_URL}/auth/return?returnTo=${encodeURIComponent(returnTo)}`,
      errorCallbackURL: `${env.APP_URL}/sign-in?error=sign-in&returnTo=${encodeURIComponent(returnTo)}`,
    },
  });
  const result = (await response.json()) as { url?: string };
  if (!response.ok || !result.url)
    return data(
      { error: "Sign-in could not start. Please try again." },
      { status: 502 },
    );
  const headers = new Headers();
  for (const cookie of response.headers.getSetCookie())
    headers.append("Set-Cookie", cookie);
  recordEvent(env, "sign_in_started", "auth", provider);
  return redirect(result.url, { headers });
}

export default function SignIn({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const [token, setToken] = useState("");
  const challengeRequired = !!(
    actionData &&
    "challengeRequired" in actionData &&
    actionData.challengeRequired === true
  );
  return (
    <PageShell width="narrow" aisles={false}>
      <header className="page-heading">
        <p className="eyebrow">Your experience makes a difference</p>
        <h1>Sign in to VeganAlts</h1>
        <p>
          Keep track of what you’ve tried and help others find a closer
          alternative. If you just chose a score, we’ll save it when you return.
        </p>
      </header>
      <section className="va-card va-sign-in" aria-label="Sign-in options">
        {actionData?.error && (
          <p className="notice error" role="alert">
            {actionData.error}
          </p>
        )}
        {loaderData.failed && (
          <p className="notice error" role="alert">
            Sign-in did not finish. Please try again.
          </p>
        )}
        {loaderData.providers.length === 0 && (
          <p className="notice">
            Sign-in is being prepared. Please check back soon.
          </p>
        )}
        <Form method="post" className="va-sign-in__providers" reloadDocument>
          <input type="hidden" name="returnTo" value={loaderData.returnTo} />
          <input type="hidden" name="challengeToken" value={token} />
          {challengeRequired && (
            <Turnstile
              siteKey={loaderData.siteKey}
              action="sign-in"
              onToken={setToken}
            />
          )}
          {loaderData.providers.map((provider) => (
            <button
              className="button"
              key={provider}
              name="provider"
              value={provider}
              disabled={!!challengeRequired && !token}
            >
              Continue with {provider === "google" ? "Google" : "Apple"}
            </button>
          ))}
        </Form>
        <a
          className="text-link"
          href={loaderData.returnTo}
          onClick={() => {
            void fetch("/api/v1/events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                event: "sign_in_cancelled",
                route: "auth",
              }),
              keepalive: true,
            }).catch(() => {});
          }}
        >
          Continue browsing →
        </a>
      </section>
      <p className="small muted va-sign-in__terms">
        By continuing you agree to the{" "}
        <Link className="text-link" to="/about/terms">
          terms and community guidelines
        </Link>
        . See how we handle your data in the{" "}
        <Link className="text-link" to="/about/privacy">
          privacy notice
        </Link>
        .
      </p>
    </PageShell>
  );
}
