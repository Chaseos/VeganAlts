import { env } from "cloudflare:workers";
import { Link, redirect } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import {
  ProductImage,
  RankingExplanation,
  Score,
  SiteShell,
  NewProductBadge,
} from "../components/catalog";
import { RatingControl } from "../components/rating-control";
import { CommentSection } from "../components/comments/comment-section";
import { ProposalResponses } from "../components/proposal-responses";
import { PhotoSlots } from "../components/photo-slots";
import { commentServices } from "@server/comments/infrastructure/composition";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/product";
import { dateLabel, friendly } from "../lib/community";

export async function loader({ request, params }: Route.LoaderArgs) {
  requireCatalogPreview(env.APP_ENV);
  const canonical = await catalogService(env).canonicalRedirect(
    params.productSlug,
  );
  if (canonical)
    throw redirect(`/us/products/${canonical.slug}`, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  return publicLoader(async () => ({
    product: await catalogService(env).product(
      params.productSlug,
      new URL(request.url).searchParams.get("version"),
    ),
    // The first Best page is crawler-visible and shares the product cache.
    comments: await commentServices(env).page(
      params.productSlug,
      "best",
      "current",
      null,
    ),
    origin: env.APP_URL,
    staging: env.APP_ENV !== "production",
  }));
}
export function meta({ loaderData: data }: Route.MetaArgs) {
  const p = data?.product;
  return publicMetadata(
    p
      ? `${p.name}${p.formula.isCurrent ? "" : " · Formula history"}`
      : "Product",
    `Explore ${p?.name ?? "this vegan alternative"}, its category scores, formula history and community experience.`,
    `/us/products/${p?.slug ?? ""}${p && !p.formula.isCurrent ? `?version=${p.versionId}` : ""}`,
    data?.origin ?? "https://veganalts.com",
    data?.staging ?? true,
  );
}
export default function Product({
  loaderData: { product: p, comments },
}: Route.ComponentProps) {
  return (
    <SiteShell>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link to="/us/search">Discover</Link>
        <span aria-hidden="true">/</span>
        <span>{p.name}</span>
      </nav>
      {!p.formula.isCurrent && (
        <div className="notice historical-notice">
          <strong>Historical formula · Read only</strong>
          <p>
            These ratings belong to a previous formula.{" "}
            <Link to={`/us/products/${p.slug}`}>
              View the current formula →
            </Link>
          </p>
        </div>
      )}
      <section className="product-overview">
        <ProductImage id={p.imageId} name={p.name} large />
        <div className="product-introduction">
          <p className="eyebrow">{p.brand}</p>
          <h1>{p.name}</h1>
          <p className="muted">
            {p.country} · {p.formula.versionLabel}
          </p>
          <div className="classification">
            <span>{p.veganStatus.replaceAll("_", " ")}</span>
            {!!p.developmentOnly && <span>Demo product</span>}
            <NewProductBadge isNew={p.isNew} />
          </div>
          <p className="product-description">
            A plant-based alternative to{" "}
            {p.categories.map((c) => c.name.toLowerCase()).join(" and ") ||
              "familiar foods"}
            . Explore how close it comes, one category at a time.
          </p>
          {p.lifecycleStatus !== "active" && (
            <p className="notice">
              This product is {p.lifecycleStatus.replaceAll("_", " ")}. New
              ratings are unavailable.
            </p>
          )}
          {p.veganStatus === "under_review" && (
            <p className="notice">
              An operator is assessing an ingredient concern. This formula is
              excluded from active rankings and new ratings until the concern is
              resolved.
            </p>
          )}
          <div className="button-row">
            <Link to={`/contribute/${p.id}`}>Suggest a change</Link>
            <Link to={`/contribute/${p.id}?action=report`}>Report product</Link>
            {p.imageId && (
              <Link to={`/contribute/${p.id}?action=report&image=${p.imageId}`}>
                Report front photo
              </Link>
            )}
          </div>
          <div className="category-strip">
            {p.categories.map((c) => (
              <a href={`#rate-${c.id}`} key={c.id}>
                {c.name} ↓
              </a>
            ))}
          </div>
        </div>
      </section>
      <div className="product-body">
        <section aria-labelledby="scores-title">
          <div className="section-heading">
            <h2 id="scores-title">How close does it come?</h2>
          </div>
          {p.categories.map((c) => (
            <article className="category-rating" id={`rate-${c.id}`} key={c.id}>
              <header>
                <div>
                  <span className="eyebrow">Compared with</span>
                  <h3>
                    {c.isActive ? (
                      <Link to={`/us/${c.slug}`}>{c.name} ↗</Link>
                    ) : (
                      c.name
                    )}
                  </h3>
                </div>
                <Score value={c.bayesianScore} count={c.ratingCount} />
              </header>
              {c.canRate ? (
                <RatingControl
                  versionId={p.versionId}
                  categoryId={c.id}
                  categoryName={c.name}
                  productSlug={p.slug}
                />
              ) : (
                <p className="muted">
                  {!c.isActive
                    ? "This category is inactive. Its historical scores are preserved."
                    : p.formula.isCurrent
                      ? "Ratings aren’t available for this category right now."
                      : "Historical scores are preserved. Choose the current formula to add your experience."}
                </p>
              )}
            </article>
          ))}
          <RankingExplanation />
          <CommentSection
            key={p.id}
            productSlug={p.slug}
            categories={p.categories
              .filter((c) => c.isActive)
              .map((c) => ({ id: c.id, name: c.name }))}
            initial={comments}
          />
        </section>
        <aside className="product-facts">
          <h2>About this product</h2>
          <dl>
            <dt>Country</dt>
            <dd>{p.country}</dd>
            <dt>Classification</dt>
            <dd>{p.veganStatus.replaceAll("_", " ")}</dd>
            <dt>Package label</dt>
            <dd>{p.manufacturerLabel.replaceAll("_", " ")}</dd>
            <dt>Formula</dt>
            <dd>{p.formula.versionLabel}</dd>
          </dl>
          <p className="small muted">
            {p.classification?.reviewed
              ? "Classification reviewed by an operator."
              : p.formula.isCurrent
                ? "Provisional classification. Uploaded evidence and manufacturer wording do not by themselves establish verification or certification."
                : "Only classification recorded for this historical formula is shown. Today’s status is not applied to past formulas."}
          </p>
          {p.classification && (
            <section>
              <h2>Ingredient evidence</h2>
              <p>{p.classification.evidence.note}</p>
              {p.classification.evidence.urls.map((url, index) => (
                <p key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    Ingredient source {index + 1} ↗
                  </a>
                </p>
              ))}
              <h3>Third-party certifications</h3>
              {p.classification.certifications.length ? (
                <ul>
                  {p.classification.certifications.map((c) => (
                    <li key={c.sourceUrl}>
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                        {c.name} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">
                  No third-party certification recorded for this formula.
                </p>
              )}
            </section>
          )}
          {p.formula.isCurrent ? <ProposalResponses productId={p.id} /> : null}
          <section id="retailers">
            <h2>Commonly found at</h2>
            <p className="small muted">
              Community availability reports, not live inventory.
            </p>
            {p.retailers.length ? (
              <ul className="retailer-list">
                {p.retailers.map((r) => (
                  <li key={r.id}>
                    <strong>{r.name}</strong>
                    <span>
                      {r.status === "not_current"
                        ? "No longer current"
                        : r.stale || r.status === "uncertain"
                          ? "Uncertain / stale"
                          : "Recently confirmed"}
                    </span>
                    <p className="small muted">
                      {r.contributorCount}{" "}
                      {r.contributorCount === 1
                        ? "contributor"
                        : "contributors"}{" "}
                      · {r.recentContributorCount} within 180 days
                      <br />
                      Last confirmed: {dateLabel(r.lastConfirmedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No retailer confirmations yet.</p>
            )}
            <Link to={`/contribute/${p.id}?action=retailer`}>
              Add or confirm a retailer →
            </Link>
          </section>
          {!!p.relatedProducts.length && (
            <section>
              <h2>Related products</h2>
              <ul>
                {p.relatedProducts.map((r) => (
                  <li key={r.id}>
                    {r.country === "US" ? (
                      <Link to={`/us/products/${r.slug}`}>{r.name}</Link>
                    ) : (
                      r.name
                    )}
                    <span className="small muted">
                      {" "}
                      · {r.country} · {friendly(r.relationship)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="small muted">
                Each product and country keeps its own ratings.
              </p>
            </section>
          )}
          {!!p.developmentOnly && (
            <p className="demo-note">
              Demo catalog. Product details, illustrations and sample ratings
              are fictional development fixtures, not verified manufacturer
              claims.
            </p>
          )}
          <section id="formula-history">
            <h2>Formula history</h2>
            <p className="small muted">
              A new formula starts fresh. Earlier experiences stay with the
              formula people tried.
            </p>
            <ul className="formula-list">
              {p.history.map((v) => (
                <li key={v.id}>
                  <Link
                    to={`/us/products/${p.slug}${v.isCurrent ? "" : `?version=${v.id}`}`}
                    aria-current={v.id === p.versionId ? "page" : undefined}
                  >
                    {v.versionLabel}
                  </Link>
                  <span>{v.isCurrent ? "Current" : "Historical"}</span>
                  {v.effectiveDate && (
                    <span>
                      Effective {v.effectiveDate} ({v.effectiveDatePrecision}{" "}
                      precision)
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="small muted">{p.formula.changeSummary}</p>
          </section>
          <PhotoSlots
            productId={p.id}
            productName={p.name}
            images={p.images}
            canPropose={
              Boolean(p.formula.isCurrent) && p.lifecycleStatus !== "hidden"
            }
          />
        </aside>
      </div>
    </SiteShell>
  );
}
