import { env } from "cloudflare:workers";
import { Link, useSearchParams } from "react-router";
import { z } from "zod";
import { communityPageActor } from "@server/community/http/page";
import { parse } from "@server/community/http/handlers";
import { communityServices } from "@server/community/infrastructure/composition";
import { taxonomyServices } from "@server/taxonomy/infrastructure/composition";
import { PageShell } from "../components/layout/page-shell";
import { EmptyState } from "../components/ui/feedback";
import { ContributionContent } from "../components/contribution-detail";
import { dateLabel, friendly } from "../lib/community";
import { t } from "../i18n";
import type { Route } from "./+types/my-contributions";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await communityPageActor(request, env),
    service = communityServices(env).moderation;
  const checks = await communityServices(env).automaticChecks.list(actor.id);
  if (params.kind === "category" && params.id)
    return {
      checks,
      detail: null,
      category: await taxonomyServices(env).proposalDetail(actor, params.id),
      list: null,
    };
  if (params.kind && params.id)
    return {
      checks,
      detail: await service.detail(
        actor,
        parse(z.enum(["submission", "proposal", "report"]), params.kind),
        params.id,
      ),
      category: null,
      list: null,
    };
  return {
    checks,
    detail: null,
    category: null,
    list: await service.contributions(
      actor,
      new URL(request.url).searchParams.get("cursor"),
    ),
  };
}
export function meta() {
  return [
    { title: t("myContributions.metaTitle") },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export default function Contributions({
  loaderData: { detail, category, list, checks },
}: Route.ComponentProps) {
  // Paging links only once there is more than one page.
  const paged = useSearchParams()[0].has("cursor") || Boolean(list?.nextCursor);
  return (
    <PageShell width="narrow">
      <header className="page-heading">
        <p className="eyebrow">{t("myContributions.eyebrow")}</p>
        <h1>
          {detail
            ? t("myContributions.statusTitle")
            : t("myContributions.title")}
        </h1>
        <p>{t("myContributions.intro")}</p>
      </header>
      {checks.length > 0 && (
        <section
          className="community-panel"
          aria-labelledby="automatic-checks-heading"
        >
          <h2 id="automatic-checks-heading">
            {t("myContributions.checksTitle")}
          </h2>
          <ul className="contribution-list">
            {checks.map((check) => (
              <li key={check.id}>
                <strong>
                  {
                    {
                      submission_finalize: t("myContributions.opSubmission"),
                      comment_create: t("myContributions.opComment"),
                      comment_edit: t("myContributions.opCommentEdit"),
                      proposal_create: t("myContributions.opProposal"),
                      proposal_response: t("myContributions.opResponse"),
                      retailer_proposal: t("myContributions.opStore"),
                      category_proposal: t("myContributions.opFood"),
                    }[check.operation]
                  }
                </strong>
                <p role="status">
                  {check.errorCode === "RESPONSE_CHANGED"
                    ? t("myContributions.replaced")
                    : check.status === "checking"
                      ? t("myContributions.checking")
                      : check.status === "blocked"
                        ? t("myContributions.rejected")
                        : t("myContributions.resubmit")}
                </p>
                <small>{dateLabel(check.createdAt)}</small>
              </li>
            ))}
          </ul>
          <p>{t("myContributions.checksNote")}</p>
        </section>
      )}
      {category && (
        <div className="community-panel">
          <div className="notice">
            <strong>
              {t("myContributions.status", {
                status: friendly(category.status),
              })}
            </strong>
            {category.resolutionNote && <p>{category.resolutionNote}</p>}
          </div>
          <h2>
            {t("myContributions.foodSuggestion", {
              name: String(category.proposed.name),
            })}
          </h2>
          <p>{String(category.proposed.explanation)}</p>
          <p>
            <Link to="/my-contributions">{t("myContributions.all")}</Link>
          </p>
        </div>
      )}
      {category ? null : detail ? (
        <div className="community-panel">
          <ContributionContent detail={detail} />
          <p>
            <Link to="/my-contributions">{t("myContributions.all")}</Link>
          </p>
          {detail.kind === "submission" && detail.canFollowUp && (
            <Link className="button" to={`/add-product?followUp=${detail.id}`}>
              {t("myContributions.followUp")}
            </Link>
          )}
          {detail.kind === "submission" && detail.supersededBy && (
            <p>
              {t("myContributions.replacedBefore")}{" "}
              <Link to={`/my-contributions/submission/${detail.supersededBy}`}>
                {t("myContributions.revisedLink")}
              </Link>
              {t("myContributions.replacedAfter")}
            </p>
          )}
        </div>
      ) : (
        <>
          {!list?.items.length ? (
            <EmptyState title={t("myContributions.emptyTitle")}>
              <Link to="/add-product">{t("myContributions.emptyAdd")}</Link>
            </EmptyState>
          ) : (
            <ul className="contribution-list">
              {list.items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link to={`/my-contributions/${item.kind}/${item.id}`}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.kind === "category"
                        ? t("myContributions.kindFood")
                        : friendly(item.kind)}{" "}
                      · {dateLabel(item.createdAt)}
                    </span>
                  </Link>
                  <span className="status-badge">{friendly(item.status)}</span>
                  {item.resolutionNote && <p>{item.resolutionNote}</p>}
                </li>
              ))}
            </ul>
          )}
          {paged && (
            <nav
              className="button-row"
              aria-label={t("myContributions.pagesLabel")}
            >
              <Link to="/my-contributions">
                {t("myContributions.mostRecent")}
              </Link>
              {list?.nextCursor && (
                <Link
                  to={`/my-contributions?cursor=${encodeURIComponent(list.nextCursor)}`}
                >
                  {t("myContributions.older")}
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </PageShell>
  );
}
