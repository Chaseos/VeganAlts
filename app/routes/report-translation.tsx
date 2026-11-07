import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { pageLanguage } from "@server/catalog/domain/markets";
import { PageShell } from "../components/layout/page-shell";
import {
  CommunityControls,
  CommunityFeedback,
} from "../components/community-form";
import { useCommunityAction } from "../lib/community";
import { t } from "../i18n";
import type { Route } from "./+types/report-translation";

export async function loader({ request }: Route.LoaderArgs) {
  await communityPageActor(request, env);
  const url = new URL(request.url);
  const market = await publicLoader(() =>
    catalogService(env).market(url.searchParams.get("country") ?? "us"),
  );
  const page = url.searchParams.get("page") ?? "";
  return {
    siteKey: env.TURNSTILE_SITE_KEY,
    market,
    page: page.startsWith("/") && !page.startsWith("//") ? page : "/",
  };
}
export function meta() {
  return [
    { title: t("reportTranslation.metaTitle") },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export default function ReportTranslation({
  loaderData: { siteKey, market, page },
}: Route.ComponentProps) {
  const action = useCommunityAction();
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const done = await action.run(() =>
      action.request("translation-reports", {
        country: market.code,
        language: pageLanguage(),
        page,
        text: String(form.get("text") ?? "").trim(),
        note: String(form.get("note") ?? "").trim(),
      }),
    );
    if (done) setSaved(true);
  }
  return (
    <PageShell width="narrow">
      <CommunityControls>
        <header className="page-heading">
          <p className="eyebrow">{market.name}</p>
          <h1>{t("reportTranslation.title")}</h1>
          <p>{t("reportTranslation.intro")}</p>
        </header>
        {saved ? (
          <div className="community-panel" role="status">
            <h2>{t("reportTranslation.thanks")}</h2>
            <p>
              <Link to={page}>{t("reportTranslation.back")}</Link>
            </p>
          </div>
        ) : (
          <form className="community-form community-panel" onSubmit={submit}>
            <label htmlFor="report-text">
              {t("reportTranslation.textLabel")}
            </label>
            <textarea
              id="report-text"
              name="text"
              required
              maxLength={500}
              rows={2}
            />
            <label htmlFor="report-note">
              {t("reportTranslation.noteLabel")}
            </label>
            <textarea id="report-note" name="note" maxLength={2000} rows={3} />
            <button
              className="button"
              disabled={action.busy || (action.challenge && !action.hasToken)}
            >
              {action.busy ? t("common.sending") : t("reportTranslation.send")}
            </button>
            <CommunityFeedback action={action} siteKey={siteKey} />
          </form>
        )}
      </CommunityControls>
    </PageShell>
  );
}
