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
import { t } from "../i18n";
import type { Route } from "./+types/report-food";

const reasons = () =>
  [
    ["not_a_food", t("reportFood.notAFood")],
    ["duplicate_food", t("reportFood.duplicate")],
    ["wrong_name", t("reportFood.wrongName")],
    ["wrong_aisle", t("reportFood.wrongCategory")],
    ["other", t("reportFood.other")],
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
    { title: t("reportFood.metaTitle") },
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
          <h1>{t("reportFood.title")}</h1>
          <p>{t("reportFood.intro")}</p>
        </header>
        {saved ? (
          <div className="community-panel" role="status">
            <h2>{t("reportFood.thanks")}</h2>
            <p>
              <Link to={back}>{t("reportFood.back")}</Link>
            </p>
          </div>
        ) : (
          <form className="community-form community-panel" onSubmit={submit}>
            <label htmlFor="report-reason">{t("reportFood.reasonLabel")}</label>
            <select id="report-reason" name="reason" required defaultValue="">
              <option value="" disabled>
                {t("reportFood.choose")}
              </option>
              {reasons().map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="report-note">{t("reportFood.noteLabel")}</label>
            <textarea id="report-note" name="note" maxLength={2000} rows={3} />
            <button
              className="button"
              disabled={action.busy || (action.challenge && !action.hasToken)}
            >
              {action.busy ? t("common.sending") : t("reportFood.send")}
            </button>
            <CommunityFeedback action={action} siteKey={siteKey} />
          </form>
        )}
      </CommunityControls>
    </PageShell>
  );
}
