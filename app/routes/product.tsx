import { env } from "cloudflare:workers";
import { Link, redirect } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import { PageShell } from "../components/layout/page-shell";
import { PhotoGallery } from "../components/catalog/photo-gallery";
import { allergenSummary } from "../components/catalog/ranking-list";
import { FoodIcon } from "../components/icons/food-icons";
import { RankFlag, ScoreLabel } from "../components/ui/score";
import {
  AllergenLabel,
  Badge,
  EarlyBadge,
  NewBadge,
  VeganStatusChip,
  veganStatusLabel,
} from "../components/ui/badges";
import { DetailBars, DistributionBars } from "../components/ui/bars";
import { Notice } from "../components/ui/feedback";
import { formatScore, plural } from "../lib/format";
import { useHydrated } from "../lib/use-hydrated";
import { saveFilters, useSavedFilters } from "../lib/ranking-filters";
import { RatingControl } from "../components/rating-control";
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
        ? `${p.name}${p.formula.isCurrent ? "" : " · Formula history"}`
        : "Product",
      `Explore ${p?.name ?? "this vegan alternative"}, its category scores, formula history and community experience.`,
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
            { name: p.name, path: productPath(data!.market.code, p.slug) },
          ]),
        ]
      : []),
  ];
}
type ProductData = Route.ComponentProps["loaderData"]["product"];
type FoodView = ProductData["categories"][number];
const MEANINGS = [
  "Not close",
  "Slightly similar",
  "Fairly close",
  "Very close",
  "Extremely close",
];

// A product page about one of its foods (canvas: Product5, PProduct5).
export default function Product({
  loaderData: { product: p, comments, market },
}: Route.ComponentProps) {
  const code = market.code;
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
              ? [{ label: p.place.aisle.name, to: aislePath }]
              : []),
            ...(p.place?.shelf
              ? [
                  {
                    label: p.place.shelf.name,
                    to: `${aislePath}?shelf=${p.place.shelf.slug}`,
                  },
                ]
              : []),
            ...(food
              ? [{ label: food.name, to: foodPath(code, food.slug) }]
              : []),
            { label: p.name },
          ]}
        />
        {!p.formula.isCurrent && (
          <Notice tone="warn" title="Historical formula · Read only">
            These ratings belong to a previous formula.{" "}
            <Link to={productPath(code, p.slug)}>View the current formula</Link>
          </Notice>
        )}
        <div className="va-product__top">
          <div className="va-product__photos">
            <PhotoGallery
              productName={p.name}
              food={food?.slug ?? "food"}
              images={p.images}
            />
            <a className="va-link va-small" href="#photo-slots">
              Suggest a better photo
            </a>
          </div>
          <div className="va-product__summary">
            <div>
              <p className="va-chip-row va-product__labels">
                {p.brand && (
                  <span className="va-product__brand">{p.brand}</span>
                )}
                <VeganStatusChip status={p.veganStatus} />
                <AllergenLabel allergens={allergens} />
                {p.isNew && <NewBadge />}
                {!!p.developmentOnly && <Badge>Demo product</Badge>}
              </p>
              <h1 className="va-product__name">{p.name}</h1>
            </div>
            {p.lifecycleStatus !== "active" && (
              <Notice>
                This product is {p.lifecycleStatus.replaceAll("_", " ")}. New
                ratings are unavailable.
              </Notice>
            )}
            {p.veganStatus === "under_review" && (
              <Notice tone="warn">
                An operator is assessing an ingredient concern. This formula is
                excluded from active rankings and new ratings until the concern
                is resolved.
              </Notice>
            )}
            {food && <ScoreCard country={code} food={food} />}
            <StoreToggles
              country={code}
              productId={p.id}
              retailers={p.retailers}
            />
            {food &&
              (food.canRate ? (
                <div id="scores-title" className="va-product__rate">
                  <div id={`rate-${food.id}`}>
                    <RatingControl
                      versionId={p.versionId}
                      categoryId={food.id}
                      categoryName={food.name}
                      productSlug={p.slug}
                      foodSlug={food.slug}
                      dimensions={food.dimensions}
                    />
                  </div>
                </div>
              ) : (
                <p id="scores-title" className="va-muted">
                  {p.formula.isCurrent
                    ? "Ratings aren’t available for this food right now."
                    : "Historical scores are preserved. Choose the current formula to add your experience."}
                </p>
              ))}
          </div>
        </div>

        <div className="va-product__cards">
          {food && food.ratingCount > 0 && (
            <section
              className="va-card va-product__card"
              aria-labelledby="distribution-title"
            >
              <h2 id="distribution-title" className="va-heading-s">
                How people rated it
              </h2>
              <p className="va-small va-muted">
                Overall closeness to {food.name.toLowerCase()}
              </p>
              <DistributionBars
                label={`Ratings of closeness to ${food.name.toLowerCase()}`}
                rows={food.distribution.map((row) => ({
                  label: `${row.score} · ${MEANINGS[row.score - 1]}`,
                  count: row.count,
                }))}
              />
            </section>
          )}
          <div className="va-card va-product__card va-product__notes">
            <CommentSection
              key={p.id}
              productSlug={p.slug}
              categories={p.categories
                .filter((c) => c.isActive)
                .map((c) => ({ id: c.id, name: c.name }))}
              initial={comments}
            />
          </div>
          {others.length > 0 && (
            <section
              className="va-card va-product__card"
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
                        <span className="va-row-link__title">{other.name}</span>
                        <span className="va-small va-muted">
                          {other.rank
                            ? `#${other.rank} of ${other.rankedCount} · ${plural(other.ratingCount, "rating")}`
                            : "Not ranked yet"}
                        </span>
                      </span>
                      {other.rank && other.bayesianScore !== null && (
                        <ScoreLabel
                          value={other.bayesianScore}
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
        </div>

        {food && p.others.length > 0 && (
          <section aria-labelledby="others-title">
            <div className="va-product__section-head">
              <h2 id="others-title" className="va-heading-m">
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
                    <span className="va-rank-row__main">
                      <span className="va-rank-row__name">{other.name}</span>
                      <span className="va-small va-muted">
                        {[other.brand, plural(other.ratingCount, "rating")]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <ScoreLabel
                      value={other.score}
                      size="compact"
                      tone={other.rank === 1 ? "tag" : "neutral"}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

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

        <div className="va-product__more">
          {p.classification && (
            <details className="va-card va-product__details">
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
            className="va-card va-product__card"
            aria-labelledby="retailers-title"
          >
            <h2 id="retailers-title" className="va-heading-s">
              Where members found it
            </h2>
            <p className="va-small va-muted">
              Community availability reports, not live inventory.
            </p>
            {p.retailers.length ? (
              <ul className="va-divided">
                {p.retailers.map((r) => (
                  <li key={r.id} className="va-product__retailer">
                    <strong>{r.name}</strong>
                    <span className="va-small va-muted">
                      {r.stale || r.status === "uncertain"
                        ? "Uncertain or stale"
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
          </section>
          {!!p.relatedProducts.length && (
            <section
              className="va-card va-product__card"
              aria-labelledby="related-title"
            >
              <h2 id="related-title" className="va-heading-s">
                Related products
              </h2>
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
            </section>
          )}
          <section
            id="formula-history"
            className="va-card va-product__card"
            aria-labelledby="history-title"
          >
            <h2 id="history-title" className="va-heading-s">
              Formula history
            </h2>
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
          </section>
          <div className="va-card va-product__card">
            <PhotoSlots
              productId={p.id}
              productName={p.name}
              images={p.images}
              canPropose={
                Boolean(p.formula.isCurrent) && p.lifecycleStatus !== "hidden"
              }
            />
          </div>
          {!!p.developmentOnly && (
            <p className="va-small va-muted">
              Demo catalog. Product details, illustrations and sample ratings
              are fictional development fixtures, not verified manufacturer
              claims.
            </p>
          )}
        </div>
      </div>
    </PageShell>
  );
}

// The chosen food's score, recent eaters, details and a link to compare.
function ScoreCard({ country, food }: { country: string; food: FoodView }) {
  const lower = food.name.toLowerCase();
  const detailCount = Math.max(0, ...food.details.map((d) => d.count));
  return (
    <section className="va-score-card" aria-label="Score">
      {food.rank && (
        <Link className="va-score-card__flag" to={foodPath(country, food.slug)}>
          <RankFlag>
            {food.rank === 1
              ? `#1 swap for ${lower}`
              : `#${food.rank} of ${food.rankedCount} for ${lower}`}
          </RankFlag>
        </Link>
      )}
      <div className="va-score-card__head">
        {food.ratingCount > 0 && food.bayesianScore !== null ? (
          <ScoreLabel value={food.bayesianScore} size="large" />
        ) : null}
        <div className="va-score-card__text">
          <strong>
            {food.ratingCount
              ? `${plural(food.ratingCount, "person", "people")} rated how close it is to ${lower}`
              : `No ratings yet for ${lower}. Be the first to say how close it is.`}
          </strong>
          {food.early && <EarlyBadge count={food.ratingCount} />}
          {food.recentEaters && (
            <span>
              People who ate {lower} in the past year give it{" "}
              <strong>{formatScore(food.recentEaters.average)}</strong>{" "}
              <span className="va-muted">
                ({plural(food.recentEaters.count, "person", "people")})
              </span>
            </span>
          )}
          {food.rankedCount > 1 && (
            <Link className="va-link" to={foodPath(country, food.slug)}>
              Compare all {food.rankedCount} {lower} swaps
            </Link>
          )}
        </div>
      </div>
      {food.details.some((d) => d.mean !== null) && (
        <div className="va-score-card__details">
          <DetailBars details={food.details} />
          <p className="va-small va-muted">
            From {plural(detailCount, "person", "people")} who added detail
            scores.
          </p>
        </div>
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
