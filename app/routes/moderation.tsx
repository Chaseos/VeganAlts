import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useRevalidator } from "react-router";
import { z } from "zod";
import { communityPageActor } from "@server/community/http/page";
import { parse } from "@server/community/http/handlers";
import { communityServices } from "@server/community/infrastructure/composition";
import type { ProductSnapshot } from "@server/community/domain/moderation";
import { hasCatalogChanges } from "@server/community/domain/change-policy";
import { SiteShell, EmptyState } from "../components/catalog";
import { ContributionContent } from "../components/contribution-detail";
import {
  CommunityFeedback,
  CommunityControls,
} from "../components/community-form";
import { CatalogSelect } from "../components/catalog-select";
import {
  useCommunityAction,
  friendly,
  dateLabel,
  type CommunityOptions,
} from "../lib/community";
import type { Route } from "./+types/moderation";

export async function loader({ request, params }: Route.LoaderArgs) {
  const actor = await communityPageActor(request, env, true),
    services = communityServices(env),
    [kind, id] = (params["*"] ?? "").split("/"),
    url = new URL(request.url);
  const common = { siteKey: env.TURNSTILE_SITE_KEY };
  if (kind === "products" && id)
    return {
      ...common,
      view: "product" as const,
      ...(await services.moderation.product(actor, id)),
    };
  if (kind === "consolidate") {
    const options =
      (await services.lookup.options()) as unknown as CommunityOptions;
    const donorId = url.searchParams.get("donor");
    if (donorId && !options.products.some((p) => p.id === donorId)) {
      const donor = await services.repository.snapshot(donorId);
      options.products.push({
        id: donor.id,
        name: donor.name,
        slug: donor.slug,
        countryId: donor.countryId,
      });
    }
    return {
      ...common,
      view: "consolidate" as const,
      options,
      donor: url.searchParams.get("donor") ?? "",
    };
  }
  if (kind && id)
    return {
      ...common,
      view: "detail" as const,
      detail: await services.moderation.detail(
        actor,
        parse(z.enum(["submission", "proposal", "report"]), kind),
        id,
      ),
    };
  return {
    ...common,
    view: "inbox" as const,
    ...(await services.moderation.inbox(actor, url.searchParams.get("cursor"))),
  };
}
export function meta() {
  return [
    { title: "Moderation · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export default function Moderation({ loaderData: data }: Route.ComponentProps) {
  const action = useCommunityAction(),
    revalidator = useRevalidator(),
    navigate = useNavigate(),
    [effect, setEffect] = useState("none"),
    [preview, setPreview] = useState<{
      donor: ProductSnapshot;
      survivor: ProductSnapshot;
      archivedContributions: Record<string, number>;
      policy: string;
    } | null>(null),
    [reverseId, setReverseId] = useState<string | null>(null);
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.view !== "detail") return;
    const form = new FormData(event.currentTarget),
      product = "product" in data.detail ? data.detail.product : null;
    await action.run(async () => {
      await action.request(
        `admin/moderation/${data.detail.kind}/${data.detail.id}/decide`,
        {
          decision: form.get("decision"),
          expectedRevision: data.detail.revision,
          note: form.get("note"),
          effect,
          ...(effect !== "none" && product
            ? { expectedProductRevision: product.revision }
            : {}),
        },
      );
      await revalidator.revalidate();
    });
  }
  async function previewDuplicate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(async () =>
      setPreview(
        await action.request(
          `admin/moderation/duplicate-preview?donor=${encodeURIComponent(String(form.get("donor")))}&survivor=${encodeURIComponent(String(form.get("survivor")))}`,
        ),
      ),
    );
  }
  async function consolidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return;
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      await action.request("admin/moderation/consolidations", {
        donorId: preview.donor.id,
        survivorId: preview.survivor.id,
        donorRevision: preview.donor.revision,
        survivorRevision: preview.survivor.revision,
        note: form.get("note"),
      });
      await navigate(`/admin/moderation/products/${preview.donor.id}`);
      setPreview(null);
    });
  }
  async function reverse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.view !== "product" || !reverseId) return;
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      await action.request(`admin/moderation/actions/${reverseId}/reverse`, {
        expectedRevision: data.product.revision,
        note: form.get("note"),
      });
      setReverseId(null);
      await revalidator.revalidate();
    });
  }
  const reported =
    data.view === "detail" && data.detail.kind === "report"
      ? (data.detail.proposed as {
          targetType?: string;
          targetId?: string;
          reason?: string;
        })
      : null;
  return (
    <SiteShell>
      <CommunityControls>
        <nav className="breadcrumbs" aria-label="Moderation navigation">
          <Link to="/admin/moderation">Review inbox</Link>
          <Link to="/admin/moderation/consolidate">Consolidate duplicates</Link>
          <Link to="/my-contributions">My contributions</Link>
        </nav>
        <header className="page-heading">
          <p className="eyebrow">Operator workspace</p>
          <h1>
            {data.view === "inbox"
              ? "Review inbox"
              : data.view === "product"
                ? data.product.name
                : data.view === "consolidate"
                  ? "Consolidate duplicate products"
                  : "Review contribution"}
          </h1>
          <p>
            Inspect the evidence, preserve history, and record a reason for
            every decision.
          </p>
        </header>
        {data.view === "inbox" && (
          <>
            {data.items.length ? (
              <ul className="contribution-list">
                {data.items.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link to={`/admin/moderation/${item.kind}/${item.id}`}>
                      <strong>{item.title}</strong>
                      <span>
                        {friendly(item.kind)} · {dateLabel(item.createdAt)}
                      </span>
                    </Link>
                    <span className="status-badge">
                      {item.priority === 1
                        ? "Ingredient priority"
                        : friendly(item.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="The inbox is clear.">
                New submissions and concerns will appear here.
              </EmptyState>
            )}
            {data.nextCursor && (
              <Link
                to={`/admin/moderation?cursor=${encodeURIComponent(data.nextCursor)}`}
              >
                Next reviews →
              </Link>
            )}
          </>
        )}
        {data.view === "detail" && (
          <div className="review-layout">
            <article className="community-panel">
              <ContributionContent detail={data.detail} />
              {reported?.targetType === "product_image" && (
                <a
                  href={`/api/v1/admin/moderation/media/${reported.targetId}/full`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect reported photo ↗
                </a>
              )}
              {"product" in data.detail && data.detail.product && (
                <Link
                  to={`/admin/moderation/products/${data.detail.product.id}`}
                >
                  Audit history and reversals →
                </Link>
              )}
            </article>
            <aside className="community-panel">
              <h2>Record a decision</h2>
              {["review", "pending", "open", "reviewing"].includes(
                data.detail.status,
              ) ? (
                <form className="community-form" onSubmit={decide}>
                  <label htmlFor="decision">Decision</label>
                  <select id="decision" name="decision">
                    {data.detail.kind === "report" ? (
                      <>
                        <option value="resolve">Resolve concern</option>
                        <option value="dismiss">Dismiss report</option>
                      </>
                    ) : (
                      <>
                        <option value="accept">Accept proposed details</option>
                        <option value="reject">Reject contribution</option>
                      </>
                    )}
                    <option value="follow_up">
                      Request follow-up evidence
                    </option>
                  </select>
                  {reported && (
                    <>
                      <label htmlFor="effect">Catalog effect</label>
                      <select
                        id="effect"
                        value={effect}
                        onChange={(e) => setEffect(e.target.value)}
                      >
                        <option value="none">
                          Keep catalog facts unchanged
                        </option>
                        {reported.reason === "ingredient_concern" && (
                          <option value="under_review">
                            Apply Under Review after assessment
                          </option>
                        )}
                        {reported.targetType === "product_image" && (
                          <option value="remove_image">
                            Remove photo from public view
                          </option>
                        )}
                      </select>
                      {effect === "under_review" && (
                        <p className="notice">
                          This removes active ranking eligibility and prevents
                          new ratings until the concern is resolved.
                        </p>
                      )}
                      {effect === "remove_image" && (
                        <p className="notice">
                          The photo becomes private. Its stored evidence and
                          audit history remain recoverable.
                        </p>
                      )}
                    </>
                  )}
                  <label htmlFor="decision-note">Reason and next steps</label>
                  <textarea
                    id="decision-note"
                    name="note"
                    minLength={8}
                    maxLength={2000}
                    required
                    rows={5}
                  />
                  <button
                    className="button"
                    disabled={
                      action.busy || (action.challenge && !action.hasToken)
                    }
                  >
                    {action.busy ? "Saving decision…" : "Save decision"}
                  </button>
                </form>
              ) : (
                <p>This contribution has already been decided.</p>
              )}
            </aside>
          </div>
        )}
        {data.view === "consolidate" && (
          <div className="community-panel">
            <form className="community-form" onSubmit={previewDuplicate}>
              {(["donor", "survivor"] as const).map((role) => (
                <div key={role}>
                  <CatalogSelect
                    id={role}
                    name={role}
                    label={
                      role === "donor"
                        ? "Duplicate to archive"
                        : "Product to keep"
                    }
                    kind="products"
                    options={data.options.products}
                    required
                    defaultValue={role === "donor" ? data.donor : ""}
                  />
                </div>
              ))}
              <button className="button secondary" disabled={action.busy}>
                Preview consolidation
              </button>
            </form>
            {preview && (
              <section>
                <h2>
                  {preview.donor.name} → {preview.survivor.name}
                </h2>
                <p className="notice">{preview.policy}</p>
                <dl className="review-facts">
                  {Object.entries(preview.archivedContributions).map(
                    ([key, count]) => (
                      <div key={key}>
                        <dt>
                          {friendly(
                            key.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`),
                          )}{" "}
                          to archive
                        </dt>
                        <dd>{count}</dd>
                      </div>
                    ),
                  )}
                </dl>
                <p>
                  The duplicate’s URLs will temporarily redirect to the
                  survivor. Formula selectors from the duplicate are removed.
                  This decision can be reversed.
                </p>
                <form className="community-form" onSubmit={consolidate}>
                  <label htmlFor="consolidation-note">
                    Evidence that these are the same product
                  </label>
                  <textarea
                    name="note"
                    id="consolidation-note"
                    required
                    minLength={8}
                    maxLength={2000}
                  />
                  <button className="button" disabled={action.busy}>
                    Archive duplicate and redirect
                  </button>
                </form>
              </section>
            )}
          </div>
        )}
        {data.view === "product" && (
          <div className="community-panel">
            <div className="button-row">
              <Link to={`/us/products/${data.product.slug}`}>
                Public entry ↗
              </Link>
              <Link to={`/contribute/${data.product.id}`}>
                Propose a catalog change
              </Link>
              <Link
                to={`/admin/moderation/consolidate?donor=${data.product.id}`}
              >
                Duplicate preview
              </Link>
            </div>
            <h2>Decision history</h2>
            {data.product.images.length > 0 && (
              <details>
                <summary>Inspect preserved photos</summary>
                <div className="evidence-images">
                  {data.product.images.map((i) => (
                    <a
                      key={i.id}
                      href={`/api/v1/admin/moderation/media/${i.id}/full`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`/api/v1/admin/moderation/media/${i.id}/thumbnail`}
                        alt={`${i.slot}, ${i.state}`}
                        width={120}
                        height={120}
                      />
                      {i.slot} · {i.state}
                    </a>
                  ))}
                </div>
              </details>
            )}
            <p>
              Reversals preserve later ratings, comments, and confirmations.
              Overlapping catalog changes must be reviewed first.
            </p>
            <ul className="contribution-list">
              {data.actions.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{friendly(item.kind)}</strong>
                    <p>{item.note}</p>
                    <span>
                      {dateLabel(item.created_at)}
                      {item.reversed_by ? " · Reversed" : ""}
                    </span>
                  </div>
                  {!item.reversed_by &&
                    item.kind !== "reversal" &&
                    hasCatalogChanges(JSON.parse(item.before_data)) && (
                      <button
                        className="button secondary"
                        onClick={() => setReverseId(item.id)}
                      >
                        Review reversal
                      </button>
                    )}
                </li>
              ))}
            </ul>
            {reverseId && (
              <form className="community-form" onSubmit={reverse}>
                <h3>Reverse the selected catalog decision</h3>
                <label htmlFor="reverse-note">Reason for reversal</label>
                <textarea
                  id="reverse-note"
                  name="note"
                  required
                  minLength={8}
                  maxLength={2000}
                />
                <div className="button-row">
                  <button className="button" disabled={action.busy}>
                    Confirm reversal
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setReverseId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
        <CommunityFeedback action={action} siteKey={data.siteKey} />
      </CommunityControls>
    </SiteShell>
  );
}
