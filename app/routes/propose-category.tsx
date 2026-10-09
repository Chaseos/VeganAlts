import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { communityServices } from "@server/community/infrastructure/composition";
import { SiteShell } from "../components/catalog";
import {
  CommunityControls,
  CommunityFeedback,
  GuidelinesNote,
} from "../components/community-form";
import { useCommunityAction, type CommunityOptions } from "../lib/community";
import type { Route } from "./+types/propose-category";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await communityPageActor(request, env);
  const options = (await communityServices(env).contributions.options(
    actor,
  )) as unknown as CommunityOptions;
  return {
    siteKey: env.TURNSTILE_SITE_KEY,
    categories: options.categories,
    name: new URL(request.url).searchParams.get("name") ?? "",
  };
}
export function meta() {
  return [
    { title: "Propose a category · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
const list = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export default function ProposeCategory({
  loaderData: { siteKey, categories, name },
}: Route.ComponentProps) {
  const action = useCommunityAction();
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parent = String(form.get("parent") ?? "");
    const done = await action.run(() =>
      action.request("category-proposals", {
        name: form.get("name"),
        ...(parent ? { parentId: parent } : {}),
        country: "US",
        explanation: form.get("explanation"),
        exampleProducts: list(form.get("examples")).slice(0, 5),
        aliases: list(form.get("aliases")).slice(0, 10),
      }),
    );
    if (done) setSaved(true);
  }
  return (
    <SiteShell compact>
      <CommunityControls>
        <header className="page-heading">
          <p className="eyebrow">Grow the taxonomy</p>
          <h1>Propose a category</h1>
          <p>
            Categories name the conventional food people want to replace, such
            as “Ground Beef” or “Cream Cheese”. A moderator checks every
            proposal for near-duplicates and overly narrow categories.
          </p>
          <GuidelinesNote />
        </header>
        {saved ? (
          <div className="community-panel" role="status">
            <h2>Thanks, your proposal is in review.</h2>
            <p>
              Track it in <Link to="/my-contributions">My contributions</Link>.
            </p>
          </div>
        ) : (
          <form className="community-form community-panel" onSubmit={submit}>
            <label htmlFor="category-name">Conventional food</label>
            <input
              id="category-name"
              name="name"
              required
              minLength={2}
              maxLength={160}
              defaultValue={name}
            />
            <label htmlFor="parent">Broader category (optional)</label>
            <select id="parent" name="parent" defaultValue="">
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label htmlFor="category-explanation">
              Why is a separate category needed?
            </label>
            <textarea
              id="category-explanation"
              name="explanation"
              required
              minLength={8}
              maxLength={2000}
              rows={4}
            />
            <label htmlFor="category-examples">
              Example alternatives (optional, separated by commas)
            </label>
            <input id="category-examples" name="examples" maxLength={800} />
            <label htmlFor="category-aliases">
              Other names (optional, separated by commas)
            </label>
            <input id="category-aliases" name="aliases" maxLength={800} />
            <button
              className="button"
              disabled={action.busy || (action.challenge && !action.hasToken)}
            >
              {action.busy ? "Sending…" : "Send proposal"}
            </button>
            <CommunityFeedback action={action} siteKey={siteKey} />
          </form>
        )}
      </CommunityControls>
    </SiteShell>
  );
}
