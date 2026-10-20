import { env } from "cloudflare:workers";
import { useEffect, useState } from "react";
import { Link, redirect, useLocation, useNavigate } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import { PageShell } from "../components/layout/page-shell";
import { PhotoGallery } from "../components/catalog/photo-gallery";
import { ProductThumbnail } from "../components/catalog/product-thumbnail";
import { allergenSummary } from "../components/catalog/ranking-list";
import { FoodIcon } from "../components/icons/food-icons";
import { RankFlag, ScoreLabel } from "../components/ui/score";
import {
  AllergenLabel,
  Badge,
  EarlyBadge,
  SeasonalProductBadge,
  TrendingBadge,
  NewBadge,
  VeganStatusChip,
  veganStatusLabel,
} from "../components/ui/badges";
import { DetailBars, DistributionBars } from "../components/ui/bars";
import { Notice } from "../components/ui/feedback";
import { formatScore, plural, productName } from "../lib/format";
import { FLAVOR_SCORE_MIN_ANSWERS } from "@server/ranking/domain/display";
import { useHydrated } from "../lib/use-hydrated";
import { saveFilters, useSavedFilters } from "../lib/ranking-filters";
import { RatingControl, SCORE_MEANINGS } from "../components/rating-control";
import { CommentSection } from "../components/comments/comment-section";
import { ProposalResponses } from "../components/proposal-responses";
import { PhotoSlots } from "../components/photo-slots";
import { commentServices } from "@server/comments/infrastructure/composition";
import { breadcrumbs, publicMetadata } from "../lib/metadata";
import {
  foodPath,
  homePath,
  productPath,
} from "@server/catalog/domain/markets";
import { Breadcrumb } from "../components/ui/navigation";
import type { Route } from "./+types/product";
import { dateLabel, friendly } from "../lib/community";

export async function loader({ request, params }: Route.LoaderArgs) {
  requireCatalogPreview(env);
  const catalog = catalogService(env);
  return publicLoader(async () => {
    const market = await catalog.market(params.country);
    const canonical = await catalog.canonicalRedirect(
      market,
      params.productSlug,
    );
    if (canonical)
      throw redirect(productPath(market.code, canonical.slug), {
        status: 302,
        headers: { "Cache-Control": "private, no-store" },
      });
    return {
      market,
      product: await catalog.product(
        market,
        params.productSlug,
        new URL(request.url).searchParams.get("version"),
        new URL(request.url).searchParams.get("food"),
      ),
      // The first Best page is crawler-visible and shares the product cache.
      comments: await commentServices(env).page(
        market.id,
        params.productSlug,
        "best",
        "current",
        null,
      ),
      origin: env.APP_URL,
      staging: env.APP_ENV !== "production",
    };
  });
}
// Products belong to one country; switching moves to the product's food.
export const handle = {
  countrySwitch: (data: unknown, code: string) => {
    const food = (
      data as
        | { product?: { categories: { slug: string; isActive: number }[] } }
        | undefined
    )?.product?.categories.find((c) => c.isActive);
    return food ? foodPath(code, food.slug) : null;
  },
};
export function meta({ loaderData: data }: Route.MetaArgs) {
  const p = data?.product;
  const origin = data?.origin ?? "https://veganalts.com";
  const category = p?.categories.find((c) => c.isActive);
  return [
    ...publicMetadata(
      p
        ? `${productName(p.name, p.brand)}${p.formula.isCurrent ? "" : " · Formula history"}`
        : "Product",
      `Explore ${p ? productName(p.name, p.brand) : "this vegan alternative"}, its scores for each food, formula history and community experience.`,
      `${productPath(data?.market.code ?? "us", p?.slug ?? "")}${p && !p.formula.isCurrent ? `?version=${p.versionId}` : ""}`,
      origin,
      data?.staging ?? true,
    ),
    ...(p
      ? [
          breadcrumbs(origin, [
            { name: "Home", path: "/" },
            ...(category
              ? [
                  {
                    name: category.name,
                    path: foodPath(data!.market.code, category.slug),
                  },
                ]
              : []),
            {
              name: productName(p.name, p.brand),
              path: productPath(data!.market.code, p.slug),
            },
          ]),
        ]
      : []),
  ];
}
type ProductData = Route.ComponentProps["loaderData"]["product"];
type FoodView = ProductData["categories"][number];

// A product page about one of its foods (canvas: Product5, PProduct5).
export default function Product({
  loaderData: { product: p, comments, market },
}: Route.ComponentProps) {
  const code = market.code;
  const title = productName(p.name, p.brand);
  // Navigation state from Add a product, never part of the cached page. It
  // shows after hydration and is cleared, so a reload doesn't repeat it.
  const location = useLocation(),
    navigate = useNavigate();
  const [added, setAdded] = useState<{
    rated: number | null;
    ratingPending: boolean;
  } | null>(null);
  useEffect(() => {
    const state = location.state as {
      added?: boolean;
      rated?: number | null;
      ratingPending?: boolean;
    } | null;
    if (!state?.added) return;
    setAdded({
      rated: state.rated ?? null,
      ratingPending: state.ratingPending === true,
    });
    void navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
      preventScrollReset: true,
    });
  }, [location, navigate]);
  const food = p.categories.find((c) => c.slug === p.food) ?? null;
  const others = p.categories.filter((c) => c.isActive && c.id !== food?.id);
  const labels = Object.fromEntries(
    p.allergenOptions.map((option) => [option.key, option.label]),
  );
  const allergens = allergenSummary(p.allergens, labels);
  const aislePath = p.place?.aisle
    ? foodPath(code, p.place.aisle.slug)
    : homePath(code);
  return (
    <PageShell
      width="wide"
      phoneBack={
        food
          ? {
              to: foodPath(code, food.slug),
              label: food.name,
              context: food.name,
            }
          : undefined
      }
    >
      <div className="va-product">
        <Breadcrumb
          items={[
            { label: "All foods", to: homePath(code) },
            ...(p.place?.aisle
              ? [
                  {
                    // "Eggs aisle / Eggs" rather than "Eggs / Eggs".
                    label:
                      p.place.aisle.name === food?.name
                        ? `${p.place.aisle.name} aisle`
                        : p.place.aisle.name,
                    to: aislePath,
                  },
                ]
              : []),
            ...(food
              ? [{ label: food.name, to: foodPath(code, food.slug) }]
              : []),
            { label: title },
          ]}
        />
        {!p.formula.isCurrent && (
          <Notice tone="warn" title="Historical formula · Read only">
            These ratings belong to a previous formula.{" "}
            <Link to={productPath(code, p.slug)}>View the current formula</Link>
          </Notice>
        )}
        <div className="va-product__top">
          <div className="va-product__primary">
            <div className="va-product__identity">
              <p className="va-chip-row va-product__labels">
                {p.veganStatus !== "unchecked" && (
                  <VeganStatusChip status={p.veganStatus} />
                )}
                <AllergenLabel allergens={allergens} />
                {p.isNew && <NewBadge />}
                {food?.line?.trending && <TrendingBadge />}
                {p.seasonal === 1 && <SeasonalProductBadge />}
                {!!p.developmentOnly && <Badge>Demo product</Badge>}
              </p>
              <h1 className="va-product__name">{title}</h1>
              {p.flavor && (
                <p className="va-product__flavor va-muted">
                  Flavor: {p.flavor}
                </p>
              )}
            </div>
            {food && (
              <section
                className="va-product__rating-area"
                aria-labelledby="ratings-title"
              >
                <h2 id="ratings-title" className="va-heading-s">
                  Ratings
                </h2>
                <ScoreCard country={code} food={food} brand={p.brand} />
                <div className="va-product__editor">
                  <h3 className="va-heading-s">Your rating</h3>
                  {food.canRate ? (
                    <div id="scores-title" className="va-product__rate">
                      <div id={`rate-${food.id}`}>
                        <RatingControl
                          key={`${p.versionId}-${food.id}`}
                          versionId={p.versionId}
                          categoryId={food.id}
                          categoryName={food.name}
                          productSlug={p.slug}
                          productName={title}
                          flavor={p.flavor}
                          foodSlug={food.slug}
                          dimensions={food.dimensions}
                          flavored={p.flavor !== null}
                        />
                      </div>
                    </div>
                  ) : (
                    <p id="scores-title" className="va-muted">
                      {p.formula.isCurrent
                        ? "Ratings aren’t available for this food right now."
                        : "Historical scores are preserved. Choose the current formula to add your experience."}
                    </p>
                  )}
                </div>
                {food.ratingCount > 0 && (
                  <details className="va-product__rating-details">
                    <summary>How people rated it</summary>
                    <RatingBreakdown food={food} />
                  </details>
                )}
                {food.rankedCount > 1 && (
                  <Link
                    className="va-link va-small"
                    to={foodPath(code, food.slug)}
                  >
                    Compare all {food.rankedCount} {food.name.toLowerCase()}{" "}
                    swaps
                  </Link>
                )}
              </section>
            )}
            <div className="va-product__summary">
              {p.lifecycleStatus !== "active" && (
                <Notice>
                  This product is {p.lifecycleStatus.replaceAll("_", " ")}. New
                  ratings are unavailable.
                </Notice>
              )}
              {added && (
                <Notice
                  tone="success"
                  title="Your product is live"
                  role="status"
                >
                  Thanks for adding it.{" "}
                  {added.rated ? (
                    <>
                      Your {added.rated}/5 rating is saved.{" "}
                      <a href="#scores-title">Add detail scores</a> if you like.
                    </>
                  ) : added.ratingPending ? (
                    <>Your rating will be saved in a moment.</>
                  ) : (
                    food?.canRate && (
                      <>
                        Tried it? <a href="#scores-title">Rate it</a> so it
                        joins the ranking.
                      </>
                    )
                  )}
                </Notice>
              )}
              {p.veganStatus === "under_review" && (
                <Notice tone="warn">
                  An operator is assessing an ingredient concern. This formula
                  is excluded from active rankings and new ratings until the
                  concern is resolved.
                </Notice>
              )}
              <StoreToggles
                country={code}
                productId={p.id}
                retailers={p.retailers}
              />

              {others.length > 0 && (
                <section
                  className="va-product__variants"
                  aria-labelledby="also-title"
                >
                  <h2 id="also-title" className="va-heading-s">
                    Also ranked for
                  </h2>
                  <ul className="va-product__also">
                    {others.map((other) => (
                      <li key={other.id}>
                        <Link
                          className="va-row-link"
                          to={`${productPath(code, p.slug)}?food=${other.slug}`}
                        >
                          <FoodIcon slug={other.slug} size={24} />
                          <span className="va-row-link__text">
                            <span className="va-row-link__title">
                              {other.name}
                            </span>
                            <span className="va-small va-muted">
                              {other.line
                                ? `#${other.line.closest.rank} of ${other.line.closest.of} · ${plural(other.line.closest.people, "person", "people")}`
                                : "Not ranked yet"}
                            </span>
                          </span>
                          {other.line && (
                            <ScoreLabel
                              value={other.line.closest.score}
                              size="compact"
                            />
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="va-small">
                    Each food has its own ranking, so the same product can score
                    differently when you use it another way.
                  </p>
                </section>
              )}
              {p.lifecycleStatus === "active" && (
                <section
                  className="va-product__variants"
                  aria-labelledby="flavors-title"
                >
                  <h2 id="flavors-title" className="va-heading-s">
                    Other flavors
                  </h2>
                  {p.otherFlavors.length > 0 ? (
                    <ul className="va-divided">
                      {p.otherFlavors.map((other) => (
                        <li key={other.id}>
                          <Link to={productPath(code, other.slug, other.food)}>
                            {other.flavor ?? productName(other.name, p.brand)}
                          </Link>
                          {other.flavor && (
                            <span className="va-small va-muted">
                              {" "}
                              · {productName(other.name, p.brand)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="va-small va-muted">
                      No other flavors of this recipe are listed yet.
                    </p>
                  )}
                  <p className="va-small">
                    <Link
                      className="va-link"
                      to={`/add-product?country=${code}${food ? `&food=${food.slug}` : ""}&line=${p.lineId}`}
                    >
                      Add another flavor
                    </Link>
                  </p>
                </section>
              )}
            </div>
          </div>
          <div className="va-product__visuals">
            <div className="va-product__photos">
              <PhotoGallery
                key={p.versionId}
                productName={title}
                food={food?.slug ?? "food"}
                images={p.images}
              />
              <details className="va-gallery__manage">
                <summary>Add or improve photos</summary>
                <PhotoSlots
                  productId={p.id}
                  productName={title}
                  images={p.images}
                  canPropose={
                    Boolean(p.formula.isCurrent) &&
                    p.lifecycleStatus !== "hidden"
                  }
                />
              </details>
            </div>
            {food && p.others.length > 0 && (
              <section
                className="va-product__alternatives"
                aria-labelledby="others-title"
              >
                <div className="va-product__section-head">
                  <h2 id="others-title" className="va-heading-s">
                    Other {food.name.toLowerCase()} swaps
                  </h2>
                  <Link className="va-link" to={foodPath(code, food.slug)}>
                    See all {food.rankedCount}
                  </Link>
                </div>
                <ul className="va-product__others">
                  {p.others.map((other) => (
                    <li key={other.slug}>
                      <Link
                        className="va-rank-row"
                        to={`${productPath(code, other.slug)}?food=${food.slug}`}
                      >
                        <span className="va-rank-row__rank">
                          <span className="sr-only">Rank </span>#{other.rank}
                        </span>
                        <ProductThumbnail
                          imageId={other.imageId}
                          food={food.slug}
                          size="small"
                        />
                        <span className="va-rank-row__main">
                          <span className="va-rank-row__name">
                            {productName(other.name, other.brand)}
                          </span>
                          <span className="va-small va-muted">
                            {plural(other.ratingCount, "person", "people")}
                          </span>
                          {other.trending && (
                            <span className="va-rank-row__meta">
                              <TrendingBadge />
                            </span>
                          )}
                        </span>
                        <ScoreLabel
                          value={other.score}
                          size="compact"
                          className="va-rank-row__score"
                          tone={other.rank === 1 ? "tag" : "neutral"}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <nav className="va-product__nav" aria-label="Product sections">
          {food && <a href="#scores-title">Rate it</a>}
          <a href="#facts-title">Product facts</a>
          <a href="#retailers">Where to find it</a>
          <a href="#formula-history">Formula history</a>
          <a href="#comments-title">Community notes</a>
        </nav>

        <section className="va-product__facts" aria-labelledby="facts-title">
          <div>
            <h2 id="facts-title" className="va-heading-s">
              Product facts
            </h2>
            <p className="va-small va-muted">
              Checked by members against package photos. Spot a mistake?{" "}
              <Link className="va-link" to={`/contribute/${p.id}`}>
                Suggest a change
              </Link>
            </p>
            <p className="va-small">
              <Link to={`/contribute/${p.id}?action=report`}>
                Report product
              </Link>
              {p.imageId && (
                <>
                  {" · "}
                  <Link
                    to={`/contribute/${p.id}?action=report&image=${p.imageId}`}
                  >
                    Report front photo
                  </Link>
                </>
              )}
            </p>
          </div>
          <dl className="va-facts">
            <dt>Vegan status</dt>
            <dd>
              {veganStatusLabel(p.veganStatus)}.{" "}
              <span className="va-muted">
                {p.classification?.reviewed
                  ? "Classification reviewed by an operator."
                  : p.formula.isCurrent
                    ? "Provisional: uploaded evidence and package wording don’t by themselves establish verification."
                    : "Only the classification recorded for this formula is shown."}
              </span>
            </dd>
            <dt>Package label</dt>
            <dd>
              {{
                vegan: "Says vegan",
                plant_based: "Says plant-based",
                neither: "Says neither vegan nor plant-based",
                unknown: "Not recorded",
              }[p.manufacturerLabel] ?? friendly(p.manufacturerLabel)}
            </dd>
            <dt>Allergens</dt>
            <dd>
              {allergens ? (
                <AllergenLabel allergens={allergens} variant="line" />
              ) : (
                "Not confirmed yet"
              )}
              .{" "}
              <span className="va-muted">
                {p.allergens && p.allergenConfirmations
                  ? `Confirmed by ${plural(p.allergenConfirmations, "member")} from the package. `
                  : ""}
                Always check the package.
              </span>{" "}
              {p.formula.isCurrent && (
                <Link
                  className="va-link"
                  to={`/contribute/${p.id}?action=change`}
                >
                  {p.allergens ? "Correct the allergens" : "Add the allergens"}
                </Link>
              )}
            </dd>
            <dt>Replaces</dt>
            <dd>
              {p.categories
                .filter((c) => c.isActive)
                .map((c) => c.name.toLowerCase())
                .join(", ") || "—"}
            </dd>
            <dt>Recipe</dt>
            <dd>
              {p.formula.isCurrent ? "Current recipe" : "Earlier recipe"}:{" "}
              {p.formula.versionLabel}.{" "}
              <a className="va-link" href="#formula-history">
                Earlier recipes
              </a>{" "}
              keep their own ratings.
            </dd>
            <dt>Sold in</dt>
            <dd>{p.country}</dd>
          </dl>
        </section>

        {p.veganStatus === "unchecked" &&
          p.formula.isCurrent &&
          // A label photo already on file only needs checking; without one,
          // someone adds it first.
          (p.images.some(
            (i) => i.slot === "ingredients" || i.slot === "nutrition",
          ) ? (
            <Notice title="Ingredients not checked yet">
              No one has checked this product’s ingredients against its label
              photo yet.{" "}
              <Link
                to={`/contribute/${p.id}?action=change&kind=classification`}
              >
                Check the ingredients
              </Link>{" "}
              and another member can confirm it.
            </Notice>
          ) : (
            <Notice title="Ingredients not checked yet">
              Whoever added this product didn’t include its ingredients. Have
              the package?{" "}
              <Link to={`/contribute/${p.id}?action=photo&slot=ingredients`}>
                Add an ingredients photo
              </Link>{" "}
              and another member can confirm it.
            </Notice>
          ))}

        <div className="va-product__more">
          {p.classification && (
            <details className="va-product__details">
              <summary>Ingredient evidence</summary>
              <p>{p.classification.evidence.note}</p>
              {p.classification.evidence.urls.map((url, index) => (
                <p key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    Ingredient source {index + 1}
                  </a>
                </p>
              ))}
              <h3 className="va-small">Third-party certifications</h3>
              {p.classification.certifications.length ? (
                <ul>
                  {p.classification.certifications.map((c) => (
                    <li key={c.sourceUrl}>
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                        {c.name}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="va-small va-muted">
                  No third-party certification recorded for this formula.
                </p>
              )}
            </details>
          )}
          {p.formula.isCurrent ? <ProposalResponses productId={p.id} /> : null}
          <section
            id="retailers"
            className="va-product__section"
            aria-labelledby="retailers-title"
          >
            <h2 id="retailers-title" className="va-heading-s">
              Where members found it
            </h2>
            <div className="va-product__section-body">
              <p className="va-small va-muted">
                Community availability reports, not live inventory.
              </p>
              {p.retailers.length ? (
                <ul className="va-divided">
                  {p.retailers.map((r) => (
                    <li key={r.id} className="va-product__retailer">
                      <strong>{r.name}</strong>
                      <span className="va-small va-muted">
                        {r.stale
                          ? "Not confirmed recently"
                          : "Recently confirmed"}{" "}
                        · {plural(r.contributorCount, "contributor")} · last
                        confirmed {dateLabel(r.lastConfirmedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No retailer confirmations yet.</p>
              )}
            </div>
          </section>
          {!!p.relatedProducts.length && (
            <section
              className="va-product__section"
              aria-labelledby="related-title"
            >
              <h2 id="related-title" className="va-heading-s">
                Related products
              </h2>
              <div className="va-product__section-body">
                <ul className="va-divided">
                  {p.relatedProducts.map((r) => (
                    <li key={r.id}>
                      {r.country ? (
                        <Link to={productPath(r.country.toLowerCase(), r.slug)}>
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                      <span className="va-small va-muted">
                        {" "}
                        · {r.country} · {friendly(r.relationship)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="va-small va-muted">
                  Each product and country keeps its own ratings.
                </p>
              </div>
            </section>
          )}
          <section
            id="formula-history"
            className="va-product__section"
            aria-labelledby="history-title"
          >
            <h2 id="history-title" className="va-heading-s">
              Formula history
            </h2>
            <div className="va-product__section-body">
              <p className="va-small va-muted">
                A new formula starts fresh. Earlier experiences stay with the
                formula people tried.
              </p>
              <ul className="va-divided">
                {p.history.map((v) => (
                  <li key={v.id} className="va-product__formula">
                    <Link
                      to={`${productPath(code, p.slug)}${v.isCurrent ? "" : `?version=${v.id}`}`}
                      aria-current={v.id === p.versionId ? "page" : undefined}
                    >
                      {v.versionLabel}
                    </Link>
                    <span className="va-small va-muted">
                      {v.isCurrent ? "Current" : "Historical"}
                      {v.effectiveDate
                        ? ` · effective ${v.effectiveDate} (${v.effectiveDatePrecision} precision)`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="va-small va-muted">{p.formula.changeSummary}</p>
            </div>
          </section>

          {!!p.developmentOnly && (
            <p className="va-small va-muted">
              Demo catalog. Product details, illustrations and sample ratings
              are fictional development fixtures, not verified manufacturer
              claims.
            </p>
          )}
        </div>
        <div className="va-product__notes">
          <CommentSection
            key={p.id}
            productSlug={p.slug}
            categories={p.categories
              .filter((c) => c.isActive)
              .map((c) => ({ id: c.id, name: c.name }))}
            initial={comments}
          />
        </div>
      </div>
    </PageShell>
  );
}

// Line scores share one visual treatment; flavor scores retain their own counts.
function ScoreCard({
  country,
  food,
  brand,
}: {
  country: string;
  food: FoodView;
  brand: string | null;
}) {
  const lower = food.name.toLowerCase();
  const line = food.line;
  return (
    <div className="va-score-card" role="group" aria-label="Community ratings">
      <div className="va-score-card__standing">
        {line && (
          <Link
            className="va-score-card__flag"
            to={foodPath(country, food.slug)}
          >
            <RankFlag>
              {line.closest.rank === 1
                ? `#1 swap for ${lower}`
                : `#${line.closest.rank} of ${line.closest.of} for ${lower}`}
            </RankFlag>
          </Link>
        )}
        {line && line.flavorCount > 1 && (
          <p className="va-score-card__context">
            Across {line.flavorCount} flavors of {productName(line.name, brand)}
          </p>
        )}
      </div>
      <div className="va-score-card__metrics">
        {(
          [
            {
              label: "Closest",
              description: `to ${lower}`,
              value: line?.closest,
              tone: "tag",
            },
            {
              label: "Tastiest",
              description: "on its own",
              value: line?.tastiest,
              tone: "tasty",
            },
          ] as const
        ).map((metric) => (
          <div className="va-score-card__metric" key={metric.label}>
            <div className="va-score-card__metric-title">
              <strong>{metric.label}</strong> <span>{metric.description}</span>
            </div>
            <div className="va-score-card__metric-value">
              {metric.value && metric.value.score !== null ? (
                <ScoreLabel
                  value={metric.value.score}
                  size="large"
                  tone={metric.tone}
                />
              ) : (
                <span className="va-score-card__unrated">Not rated yet</span>
              )}
              <div className="va-score-card__text">
                {metric.value && (
                  <strong>
                    #{metric.value.rank} of {metric.value.of}
                  </strong>
                )}
                <span>
                  {plural(metric.value?.people ?? 0, "person", "people")}
                </span>
                {metric.value?.early && (
                  <EarlyBadge count={metric.value.people} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      {line && line.flavorCount > 1 && (
        <div className="va-score-card__flavor">
          <strong>This flavor</strong>
          <div className="va-score-card__flavor-scores">
            {(["closest", "tastiest"] as const).map((metric) => {
              const own = food.flavorScores[metric];
              return (
                <div key={metric}>
                  <span>{metric === "closest" ? "Closest" : "Tastiest"}</span>
                  {own.count >= FLAVOR_SCORE_MIN_ANSWERS &&
                  own.score !== null ? (
                    <ScoreLabel
                      value={own.score}
                      size="mini"
                      tone={metric === "tastiest" ? "tasty" : "neutral"}
                    />
                  ) : (
                    <span className="va-small va-muted">
                      Too few ratings yet
                    </span>
                  )}
                  <span className="va-small va-muted">
                    {plural(own.count, "person", "people")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function RatingBreakdown({ food }: { food: FoodView }) {
  const detailCount = Math.max(0, ...food.details.map((d) => d.count));
  return (
    <section
      className="va-product__breakdown"
      aria-labelledby="distribution-title"
    >
      <h3 id="distribution-title" className="sr-only">
        Rating breakdown
      </h3>
      <p className="va-small va-muted">
        This flavor · Closeness to {food.name.toLowerCase()} ·{" "}
        {plural(food.ratingCount, "person", "people")}
      </p>
      <DistributionBars
        label={`Ratings of closeness to ${food.name.toLowerCase()}`}
        rows={food.distribution.map((row) => ({
          label: `${row.score} · ${SCORE_MEANINGS[row.score - 1]}`,
          count: row.count,
        }))}
      />
      {food.details.some((d) => d.mean !== null) && (
        <div className="va-product__detail-scores">
          <h3 className="va-heading-s">A closer look</h3>
          <DetailBars details={food.details} />
          <p className="va-small va-muted">
            From {plural(detailCount, "person", "people")} who added detail
            scores to this flavor.
          </p>
        </div>
      )}
      {food.recentEaters && (
        <p className="va-small va-muted">
          People who ate {food.name.toLowerCase()} in the past year give this
          flavor <strong>{formatScore(food.recentEaters.average)}/5</strong> (
          {plural(food.recentEaters.count, "person", "people")}).
        </p>
      )}
    </section>
  );
}

// Stores members report, as toggles that save the visitor's own stores on
// this device (rankings then show what is found at any of them).
function StoreToggles({
  country,
  productId,
  retailers,
}: {
  country: string;
  productId: string;
  retailers: ProductData["retailers"];
}) {
  const hydrated = useHydrated();
  const saved = useSavedFilters(country);
  const mine = new Set(saved.stores);
  const add = (
    <Link
      className="va-link va-small"
      to={`/contribute/${productId}?action=retailer`}
    >
      Seen it elsewhere? Add or confirm a retailer
    </Link>
  );
  if (!retailers.length)
    return (
      <p className="va-small">Nobody has reported where it’s sold yet. {add}</p>
    );
  return (
    <div className="va-store-toggles">
      <div className="va-store-toggles__row">
        <span className="va-store-toggles__lead" id="found-at">
          Commonly found at
        </span>
        <ul className="va-chip-row" aria-labelledby="found-at">
          {retailers.map((retailer) => {
            const yours = mine.has(retailer.slug);
            return (
              <li key={retailer.id}>
                {hydrated ? (
                  <button
                    type="button"
                    className="va-chip"
                    aria-pressed={yours}
                    onClick={() =>
                      saveFilters(country, {
                        ...saved,
                        stores: yours
                          ? saved.stores.filter((s) => s !== retailer.slug)
                          : [...saved.stores, retailer.slug].sort(),
                      })
                    }
                  >
                    {retailer.name}
                    {yours && (
                      <span className="va-store-toggles__yours"> · yours</span>
                    )}
                  </button>
                ) : (
                  <span className="va-chip">{retailer.name}</span>
                )}
              </li>
            );
          })}
        </ul>
        {add}
      </div>
      <p className="va-small va-muted">
        Tap every store you shop at to save them on this device. Rankings will
        show what you can find at any of them.
      </p>
    </div>
  );
}
