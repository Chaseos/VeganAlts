import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { SiteShell } from "../components/catalog";
import {
  CommunityControls,
  CommunityFeedback,
  GuidelinesNote,
} from "../components/community-form";
import { useCommunityAction } from "../lib/community";
import type { Route } from "./+types/propose-category";

export async function loader({ request }: Route.LoaderArgs) {
  await communityPageActor(request, env);
  const url = new URL(request.url);
  // A food is proposed for the country the visitor came from.
  const catalog = catalogService(env);
  const market = await publicLoader(() =>
    catalog.market(url.searchParams.get("country") ?? "us"),
  );
  return {
    siteKey: env.TURNSTILE_SITE_KEY,
    market,
    aisles: await catalog.shelves(market),
    shelf: url.searchParams.get("shelf") ?? "",
    name: url.searchParams.get("name") ?? "",
  };
}
export function meta() {
  return [
    { title: "Suggest a food · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
const list = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export default function ProposeCategory({
  loaderData: { siteKey, market, aisles, shelf, name },
}: Route.ComponentProps) {
  const action = useCommunityAction();
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const done = await action.run(() =>
      action.request("category-proposals", {
        name: form.get("name"),
        shelfId: form.get("shelf"),
        country: market.code,
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
          <p className="eyebrow">{market.name} · Grow the aisles</p>
          <h1>Suggest a food</h1>
          <p>
            Foods name the conventional product people want to replace, such as
            “Ground Beef” or “Cream Cheese”. Each one gets its own ranking. A
            moderator checks every suggestion for near-duplicates and overly
            narrow foods.
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
            <label htmlFor="shelf">Aisle and shelf</label>
            <select
              id="shelf"
              name="shelf"
              required
              defaultValue={
                aisles.flatMap((a) => a.shelves).find((s) => s.slug === shelf)
                  ?.id ?? ""
              }
              aria-describedby="shelf-help"
            >
              <option value="" disabled>
                Choose where it belongs
              </option>
              {aisles.map((aisle) => (
                <optgroup key={aisle.id} label={aisle.name}>
                  {aisle.shelves.map((s) => (
                    <option key={s.id} value={s.id}>
                      {aisle.name} · {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p id="shelf-help" className="field-hint">
              Foods sit on a shelf in an aisle, the way a store is organized.
            </p>
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
