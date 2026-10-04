import { env } from "cloudflare:workers";
import { Form, data, redirect } from "react-router";
import { configuredProviders, getAuth } from "@server/auth/infrastructure/auth";
import { requireSameOrigin } from "@server/shared/http/security";
import { limitedFormData } from "@server/shared/http/limited-form";
import type { Route } from "./+types/sign-in";

export function loader({ request }: Route.LoaderArgs) {
  return {
    providers: configuredProviders(env),
    staging: env.APP_ENV !== "production",
    failed: new URL(request.url).searchParams.has("error"),
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
      callbackURL: `${env.APP_URL}/account`,
      errorCallbackURL: `${env.APP_URL}/sign-in?error=sign-in`,
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
  return redirect(result.url, { headers });
}

export default function SignIn({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main id="main" className="message-page">
      {loaderData.staging && (
        <p className="environment-banner">
          Development preview · Staging account
        </p>
      )}
      <a className="wordmark" href="/">
        VeganAlts.
      </a>
      <h1>Welcome to VeganAlts.</h1>
      <p>Sign in to manage your profile. Community features are coming soon.</p>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {loaderData.failed && (
        <p role="alert">Sign-in did not finish. Please try again.</p>
      )}
      {loaderData.providers.length === 0 && (
        <p>Sign-in is being prepared. Please check back soon.</p>
      )}
      <Form method="post" className="account-form">
        {loaderData.providers.map((provider) => (
          <button
            className="button"
            key={provider}
            name="provider"
            value={provider}
          >
            Continue with {provider === "google" ? "Google" : "Apple"}
          </button>
        ))}
      </Form>
    </main>
  );
}
