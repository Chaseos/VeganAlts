import { env } from "cloudflare:workers";
import { Form, data, redirect } from "react-router";
import { requireUser } from "@server/auth/application/session";
import { BetterAuthSessionReader } from "@server/auth/infrastructure/session-reader";
import { getAuth, profilesService } from "@server/auth/infrastructure/auth";
import { ApplicationError } from "@server/shared/domain/errors";
import { requireSameOrigin } from "@server/shared/http/security";
import { limitedFormData } from "@server/shared/http/limited-form";
import type { Route } from "./+types/account";

async function accountUser(request: Request) {
  try {
    return await requireUser(request, new BetterAuthSessionReader(env));
  } catch (error) {
    if (error instanceof ApplicationError && error.status === 401)
      throw redirect("/sign-in");
    if (error instanceof ApplicationError)
      throw new Response(error.message, { status: error.status });
    throw error;
  }
}
export async function loader({ request }: Route.LoaderArgs) {
  return {
    user: await accountUser(request),
    staging: env.APP_ENV !== "production",
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
        { saved: false, error: "Sign-out failed. Please try again." },
        { status: 502 },
      );
    const headers = new Headers();
    for (const cookie of response.headers.getSetCookie())
      headers.append("Set-Cookie", cookie);
    return redirect("/", { headers });
  }
  try {
    await profilesService(env).update(user.id, {
      handle: String(form.get("handle") ?? ""),
      displayName: String(form.get("displayName") ?? ""),
    });
    return { saved: true, error: null };
  } catch (error) {
    if (error instanceof ApplicationError)
      return data(
        { saved: false, error: error.message },
        { status: error.status },
      );
    throw error;
  }
}

export default function Account({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { profile } = loaderData.user;
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
      <h1>Your profile</h1>
      <p>
        Your handle and display name will be public when community features
        launch.
      </p>
      <Form method="post" className="account-form">
        <label htmlFor="handle">Public handle</label>
        <input
          id="handle"
          name="handle"
          defaultValue={profile.handle}
          required
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z][a-zA-Z0-9_]{2,29}"
          autoComplete="username"
          aria-describedby="handle-help"
        />
        <p id="handle-help">
          3–30 letters, numbers or underscores. Start with a letter.
        </p>
        <label htmlFor="display-name">Display name (optional)</label>
        <input
          id="display-name"
          name="displayName"
          defaultValue={profile.displayName ?? ""}
          maxLength={60}
          autoComplete="nickname"
        />
        <button className="button" name="intent" value="save">
          Save profile
        </button>
        {actionData?.error && <p role="alert">{actionData.error}</p>}
        {actionData?.saved && <p role="status">Profile saved.</p>}
      </Form>
      <Form method="post">
        <button className="button secondary" name="intent" value="sign-out">
          Sign out
        </button>
      </Form>
    </main>
  );
}
