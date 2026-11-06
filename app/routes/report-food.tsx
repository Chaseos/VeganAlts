import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { foodPath } from "@server/catalog/domain/markets";
import { PageShell } from "../components/layout/page-shell";
import {
  CommunityControls,
  CommunityFeedback,
} from "../components/community-form";
import { useCommunityAction } from "../lib/community";
import type { Route } from "./+types/report-food";

const REASONS = [
  ["not_a_food", "It isn’t a food"],
  ["duplicate_food", "It’s the same as another food"],
  ["wrong_name", "The name is wrong"],
  ["wrong_aisle", "It’s in the wrong category"],
  ["other", "Something else"],
] as const;

export async function loader({ request }: Route.LoaderArgs) {
  await communityPageActor(request, env);
  const url = new URL(request.url);
  const catalog = catalogService(env);
  const market = await publicLoader(() =>
    catalog.market(url.searchParams.get("country") ?? "us"),
  );
  const food = url.searchParams.get("food") ?? "";
  return { siteKey: env.TURNSTILE_SITE_KEY, market, food };
}
export function meta() {
  return [
    { title: "Report a food · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function ReportFood({
  loaderData: { siteKey, market, food },
}: Route.ComponentProps) {
  const action = useCommunityAction();
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const done = await action.run(() =>
      action.request("food-reports", {
        food,
        country: market.code,
        reason: form.get("reason"),
        note: String(form.get("note") ?? "").trim(),
      }),
    );
    if (done) setSaved(true);
  }
  const back = foodPath(market.code, food);
  return (
    <PageShell width="narrow">
      <CommunityControls>
        <header className="page-heading">
          <p className="eyebrow">{market.name}</p>
          <h1>Report a food</h1>
          <p>Tell us what’s wrong with this food’s page.</p>
        </header>
        {saved ? (
          <div className="community-panel" role="status">
            <h2>Thanks, we’ll take a look.</h2>
            <p>
              <Link to={back}>Back to the food</Link>
            </p>
          </div>
        ) : (
          <form className="community-form community-panel" onSubmit={submit}>
            <label htmlFor="report-reason">What’s wrong? (required)</label>
            <select id="report-reason" name="reason" required defaultValue="">
              <option value="" disabled>
                Choose a reason
              </option>
              {REASONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="report-note">Anything to add? (optional)</label>
            <textarea id="report-note" name="note" maxLength={2000} rows={3} />
            <button
              className="button"
              disabled={action.busy || (action.challenge && !action.hasToken)}
            >
              {action.busy ? "Sending…" : "Send report"}
            </button>
            <CommunityFeedback action={action} siteKey={siteKey} />
          </form>
        )}
      </CommunityControls>
    </PageShell>
  );
}
