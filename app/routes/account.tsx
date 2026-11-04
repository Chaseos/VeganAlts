import { useState } from "react";
import { Turnstile } from "../components/turnstile";
import { protectContribution, protectAiAdmission } from "@server/abuse/service";
import { env } from "cloudflare:workers";
import { Form, data, redirect } from "react-router";
import { getAuth, profilesService } from "@server/auth/infrastructure/auth";
import { ApplicationError } from "@server/shared/domain/errors";
import { requireSameOrigin } from "@server/shared/http/security";
import { limitedFormData } from "@server/shared/http/limited-form";
import type { Route } from "./+types/account";
import { PageShell } from "../components/layout/page-shell";
import { Link } from "react-router";
import { requirePageUser } from "@server/auth/http/require-page-user";
import { scheduleCatalogInvalidation } from "@server/catalog/infrastructure/invalidation";

async function accountUser(request: Request) {
  return requirePageUser(request, env);
}
export async function loader({ request }: Route.LoaderArgs) {
  const user = await accountUser(request);
  return {
    user,
    staging: env.APP_ENV !== "production",
    siteKey: env.TURNSTILE_SITE_KEY || null,
    administrator: env.ADMIN_USER_IDS.split(",")
      .map((s) => s.trim())
      .includes(user.id),
  };
}
export function meta() {
  return [
    { title: "Your profile · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  requireSameOrigin(request, env.APP_URL);
  const user = await accountUser(request);
  const form = await limitedFormData(request, 8 * 1024);
  if (form.get("intent") === "sign-out") {
    const response = await (
      await getAuth(env)
    ).api.signOut({ headers: request.headers, asResponse: true });
    if (!response.ok)
      return data(
        {
          saved: false,
          error: "Sign-out failed. Please try again.",
          challengeRequired: false,
          values: null,
        },
        { status: 502 },
      );
    const headers = new Headers();
    for (const cookie of response.headers.getSetCookie())
      headers.append("Set-Cookie", cookie);
    return redirect("/", { headers });
  }
  try {
    await protectContribution(
      request,
      env,
      "community",
      user.id,
      String(form.get("challengeToken") ?? "") || undefined,
      env.PROFILE_RATE_LIMIT,
    );
    await protectAiAdmission(request, env, user.id);
    const profile = await profilesService(env).update(user.id, {
      handle: String(form.get("handle") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
    });
    scheduleCatalogInvalidation(
      [...new Set([user.profile.handle, profile.handle])].map((slug) => ({
        kind: "profile",
        slug,
      })),
    );
    return { saved: true, error: null, challengeRequired: false, values: null };
  } catch (error) {
    if (error instanceof ApplicationError)
      return data(
        {
          saved: false,
          error: error.message,
          challengeRequired: error.code === "CHALLENGE_REQUIRED",
          values: {
            handle: String(form.get("handle") ?? ""),
            displayName: String(form.get("displayName") ?? ""),
          },
        },
        {
          status: error.status,
          headers:
            error.status === 429
              ? { "Retry-After": String(error.retryAfter ?? 60) }
              : undefined,
        },
      );
    throw error;
  }
}

export default function Account({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { profile } = loaderData.user;
  const [token, setToken] = useState("");
  const values = actionData?.values;
  return (
    <PageShell width="narrow" aisles={false}>
      <header className="page-heading">
        <p className="eyebrow">Account</p>
        <h1>Your profile</h1>
        <p>
          Your chosen handle and display name are public. Your email and
          individual rating history stay private.
        </p>
      </header>
      <nav aria-label="Your activity" className="va-card va-link-list">
        <ul className="va-divided">
          <li>
            <Link to={`/users/${profile.handle}`}>View public profile</Link>
          </li>
          <li>
            <Link to="/my-ratings">My ratings</Link>
          </li>
          <li>
            <Link to="/my-contributions">My contributions</Link>
          </li>
          {loaderData.administrator && (
            <li>
              <Link to="/admin/moderation">Moderation inbox</Link>
            </li>
          )}
        </ul>
      </nav>
      <section className="va-card section-space" aria-labelledby="profile-form">
        <h2 id="profile-form" className="va-heading-s">
          Public profile
        </h2>
        <Form method="post" reloadDocument>
          <div className="form-field">
            <label htmlFor="handle">Public handle</label>
            <input
              id="handle"
              name="handle"
              defaultValue={values?.handle ?? profile.handle}
              required
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z][a-zA-Z0-9_]{2,29}"
              autoComplete="username"
              aria-describedby="handle-help"
            />
            <p id="handle-help" className="field-hint">
              3–30 letters, numbers or underscores. Start with a letter.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="display-name">Display name (optional)</label>
            <input
              id="display-name"
              name="displayName"
              defaultValue={values?.displayName ?? profile.displayName ?? ""}
              maxLength={60}
              autoComplete="nickname"
            />
          </div>
          <input type="hidden" name="challengeToken" value={token} />
          {actionData?.challengeRequired && (
            <Turnstile
              siteKey={loaderData.siteKey}
              action="community"
              onToken={setToken}
            />
          )}
          <button className="button" name="intent" value="save">
            Save profile
          </button>
          {actionData?.error && (
            <p className="notice error" role="alert">
              {actionData.error}
            </p>
          )}
          {actionData?.saved && (
            <p className="notice success" role="status">
              Profile saved.
            </p>
          )}
        </Form>
      </section>
      <Form method="post" reloadDocument className="section-space">
        <button className="button secondary" name="intent" value="sign-out">
          Sign out
        </button>
      </Form>
    </PageShell>
  );
}
