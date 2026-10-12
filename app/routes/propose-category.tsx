import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { PageShell } from "../components/layout/page-shell";
import { AisleSelect } from "../components/aisle-select";
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
    aisles: await catalog.aisles(market),
    aisle: url.searchParams.get("aisle") ?? "",
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
  loaderData: { siteKey, market, aisles, aisle, name: initialName },
}: Route.ComponentProps) {
  const action = useCommunityAction();
  const [saved, setSaved] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [aisleId, setAisleId] = useState(
    aisles.find((a) => a.slug === aisle || a.id === aisle)?.id ?? "",
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const explanation = String(form.get("explanation") ?? "").trim();
    const done = await action.run(() =>
      action.request("category-proposals", {
        name,
        aisleId,
        country: market.code,
        ...(explanation ? { explanation } : {}),
        aliases: list(form.get("aliases")).slice(0, 10),
      }),
    );
    if (done) setSaved(name.trim());
  }
  // A product for the food can travel with it, reviewed together.
  const withProduct = new URLSearchParams({ country: market.code });
  if (name.trim()) withProduct.set("newFood", name.trim());
  if (aisleId) withProduct.set("aisle", aisleId);
  return (
    <PageShell width="narrow">
      <CommunityControls>
        <header className="page-heading">
          <p className="eyebrow">{market.name}</p>
          <h1>Suggest a food</h1>
          <p>
            A food is the conventional product people want to replace, like
            “Sausage rolls” or “Cream cheese”. It gets its own ranking. It opens
            in {market.name} first; other countries get it when someone adds a
            product there.
          </p>
          <GuidelinesNote />
        </header>
        {saved ? (
          <div className="community-panel" role="status">
            <h2>Thanks, {saved} is in review.</h2>
            <p>
              A moderator checks it for duplicates. Track it in{" "}
              <Link to="/my-contributions">My contributions</Link>.
            </p>
          </div>
        ) : (
          <form className="community-form community-panel" onSubmit={submit}>
            <label htmlFor="category-name">Food name (required)</label>
            <input
              id="category-name"
              name="name"
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <AisleSelect
              id="aisle"
              aisles={aisles}
              value={aisleId}
              onChange={setAisleId}
              required
            />
            <label htmlFor="category-aliases">
              Other names (optional, separated by commas)
            </label>
            <input id="category-aliases" name="aliases" maxLength={800} />
            <label htmlFor="category-explanation">
              Anything we should know? (optional)
            </label>
            <textarea
              id="category-explanation"
              name="explanation"
              maxLength={2000}
              rows={3}
            />
            <button
              className="button"
              disabled={action.busy || (action.challenge && !action.hasToken)}
            >
              {action.busy ? "Sending…" : "Suggest food"}
            </button>
            <p className="small">
              Have a product for it?{" "}
              <Link to={`/add-product?${withProduct}`}>
                Add it with the product
              </Link>{" "}
              and both are reviewed together.
            </p>
            <CommunityFeedback action={action} siteKey={siteKey} />
          </form>
        )}
      </CommunityControls>
    </PageShell>
  );
}
