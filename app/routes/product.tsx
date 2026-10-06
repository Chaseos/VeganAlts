import { env } from "cloudflare:workers";
import { Link } from "react-router";
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
} from "../components/catalog";
import { RatingControl } from "../components/rating-control";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/product";

export async function loader({ request, params }: Route.LoaderArgs) {
  requireCatalogPreview(env.APP_ENV);
  return publicLoader(async () => ({
    product: await catalogService(env).product(
      params.productSlug,
      new URL(request.url).searchParams.get("version"),
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
  loaderData: { product: p },
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
                    <Link to={`/us/${c.slug}`}>{c.name} ↗</Link>
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
                  {p.formula.isCurrent
                    ? "Ratings aren’t available for this category right now."
                    : "Historical scores are preserved. Choose the current formula to add your experience."}
                </p>
              )}
            </article>
          ))}
          <RankingExplanation />
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
                </li>
              ))}
            </ul>
            <p className="small muted">{p.formula.changeSummary}</p>
          </section>
          {p.images.filter((i) => i.slot !== "front").length > 0 && (
            <section>
              <h2>Product images</h2>
              <div className="evidence-images">
                {p.images
                  .filter((i) => i.slot !== "front")
                  .map((i) => (
                    <a
                      href={`/media/${i.id}/${i.hasEvidence ? "evidence" : "full"}`}
                      key={i.id}
                    >
                      <img
                        src={`/media/${i.id}/thumbnail`}
                        alt={`${p.name}: ${i.slot}`}
                        width="100"
                        height="100"
                        loading="lazy"
                      />
                      {i.slot}
                    </a>
                  ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </SiteShell>
  );
}
