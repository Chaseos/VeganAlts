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
    { title: "My contributions · VeganAlts" },
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
        <p className="eyebrow">Your catalog contributions</p>
        <h1>{detail ? "Contribution status" : "My contributions"}</h1>
        <p>
          Check publication, review outcomes, and requests for more evidence.
        </p>
      </header>
      {checks.length > 0 && (
        <section
          className="community-panel"
          aria-labelledby="automatic-checks-heading"
        >
          <h2 id="automatic-checks-heading">Automatic checks</h2>
          <ul className="contribution-list">
            {checks.map((check) => (
              <li key={check.id}>
                <strong>
                  {
                    {
                      submission_finalize: "Product submission",
                      comment_create: "Comment",
                      comment_edit: "Comment edit",
                      proposal_create: "Product change",
                      proposal_response: "Response to a suggested change",
                      retailer_proposal: "Store suggestion",
                      category_proposal: "Food suggestion",
                    }[check.operation]
                  }
                </strong>
                <p role="status">
                  {check.errorCode === "RESPONSE_CHANGED"
                    ? "Replaced by your newer response"
                    : check.status === "checking"
                      ? "Checking automatically"
                      : check.status === "blocked"
                        ? "Rejected — please revise before submitting again"
                        : "Please resubmit"}
                </p>
                <small>{dateLabel(check.createdAt)}</small>
              </li>
            ))}
          </ul>
          <p>
            These checks run automatically. Your contributions stay private
            until they finish.
          </p>
        </section>
      )}
      {category && (
        <div className="community-panel">
          <div className="notice">
            <strong>Status: {friendly(category.status)}</strong>
            {category.resolutionNote && <p>{category.resolutionNote}</p>}
          </div>
          <h2>Food suggestion: {String(category.proposed.name)}</h2>
          <p>{String(category.proposed.explanation)}</p>
          <p>
            <Link to="/my-contributions">← All contributions</Link>
          </p>
        </div>
      )}
      {category ? null : detail ? (
        <div className="community-panel">
          <ContributionContent detail={detail} />
          <p>
            <Link to="/my-contributions">← All contributions</Link>
          </p>
          {detail.kind === "submission" && detail.canFollowUp && (
            <Link className="button" to={`/add-product?followUp=${detail.id}`}>
              Respond to follow-up →
            </Link>
          )}
          {detail.kind === "submission" && detail.supersededBy && (
            <p>
              This record was replaced by your{" "}
              <Link to={`/my-contributions/submission/${detail.supersededBy}`}>
                revised submission
              </Link>
              . The original details and evidence remain available here.
            </p>
          )}
        </div>
      ) : (
        <>
          {!list?.items.length ? (
            <EmptyState title="Help the catalog grow.">
              <Link to="/add-product">Add a product →</Link>
            </EmptyState>
          ) : (
            <ul className="contribution-list">
              {list.items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link to={`/my-contributions/${item.kind}/${item.id}`}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.kind === "category"
                        ? "food suggestion"
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
            <nav className="button-row" aria-label="Contribution pages">
              <Link to="/my-contributions">Most recent</Link>
              {list?.nextCursor && (
                <Link
                  to={`/my-contributions?cursor=${encodeURIComponent(list.nextCursor)}`}
                >
                  Older contributions →
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </PageShell>
  );
}
