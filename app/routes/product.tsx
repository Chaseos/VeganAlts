import { env } from "cloudflare:workers";
import { useEffect, useState } from "react";
import { Link, redirect, useLocation, useNavigate } from "react-router";
import { publicCatalogService } from "@server/catalog/infrastructure/composition";
import {
  publicLoader,
  requireCatalogPreview,
  pageLanguage,
} from "@server/catalog/http/loader";
import { PageShell } from "../components/layout/page-shell";
import { ProductPhotos } from "../components/catalog/product-photos";
import { ProductThumbnail } from "../components/catalog/product-thumbnail";
import { allergenSummary } from "../components/catalog/ranking-list";
import { FoodIcon } from "../components/icons/food-icons";
import { RankFlag, ScoreLabel } from "../components/ui/score";
import {
  AllergenLabel,
  Badge,
  EarlyBadge,
  SeasonalBadge,
  TrendingBadge,
  NewBadge,
  VeganStatusChip,
  veganStatusLabel,
} from "../components/ui/badges";
import { DetailBars, DistributionBars } from "../components/ui/bars";
import { Notice } from "../components/ui/feedback";
import {
  formatCount,
  formatScore,
  inSentence,
  productName,
} from "../lib/format";
import { t, type MessageKey } from "../i18n";
import { FLAVOR_SCORE_MIN_ANSWERS } from "@server/ranking/domain/display";
import { useHydrated } from "../lib/use-hydrated";
import { saveFilters, useSavedFilters } from "../lib/ranking-filters";
import { RatingControl, scoreMeanings } from "../components/rating-control";
import { CommentSection } from "../components/comments/comment-section";
import { usePersonalState } from "../components/personal-state";
import { ProposalResponses } from "../components/proposal-responses";
import { SaveButton } from "../components/save-button";
import { recordProductView } from "../lib/product-view";
import { publicCommentService } from "@server/comments/infrastructure/composition";
import {
  breadcrumbs,
  publicMetadata,
  countryAlternates,
} from "../lib/metadata";
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
  const catalog = publicCatalogService(env, pageLanguage(request));
  return publicLoader(async () => {
    const market = await catalog.market(params.country);
    // Read alongside the redirect check; a moved slug's failures are never seen.
    const page = Promise.all([
      catalog.product(
        market,
        params.productSlug,
        new URL(request.url).searchParams.get("version"),
        new URL(request.url).searchParams.get("food"),
      ),
      // The first Best page is crawler-visible and shares the product cache.
      publicCommentService(env).page(
        market.id,
        params.productSlug,
        "best",
        "current",
        null,
      ),
    ]);
    page.catch(() => {});
    const canonical = await catalog.canonicalRedirect(
      market,
      params.productSlug,
    );
    if (canonical)
      throw redirect(productPath(market.code, canonical.slug), {
        status: 302,
        headers: { "Cache-Control": "private, no-store" },
      });
    const [product, comments] = await page;
    return {
      market,
      product,
      comments,
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
        ? p.formula.isCurrent
          ? productName(p.name, p.brand)
          : t("product.historyTitle", { name: productName(p.name, p.brand) })
        : t("product.title"),
      t("product.description", {
        name: p ? productName(p.name, p.brand) : t("product.thisAlternative"),
      }),
      `${productPath(data?.market.code ?? "us", p?.slug ?? "")}${p && !p.formula.isCurrent ? `?version=${p.versionId}` : ""}`,
      origin,
      data?.staging ?? true,
    ),
    ...(p
      ? countryAlternates(origin, [data!.market], (code, language) =>
          productPath(code, p.slug, null, language),
        )
      : []),
    ...(p
      ? [
          breadcrumbs(origin, [
            { name: t("product.home"), path: "/" },
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

const counted = (key: MessageKey, n: number) =>
  t(key, { count: n, amount: formatCount(n) });

function ProductAdminLink({ productId }: { productId: string }) {
  const { user } = usePersonalState();
  return user?.administrator ? (
    <p className="va-small">
      <Link to={`/admin/moderation/products/${productId}`}>
        {t("product.manage")}
      </Link>
    </p>
  ) : null;
}

const MANUFACTURER_LABEL_KEYS: Record<string, MessageKey> = {
  vegan: "product.labelVegan",
  plant_based: "product.labelPlantBased",
  neither: "product.labelNeither",
  unknown: "product.labelUnknown",
};

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
  useEffect(() => recordProductView(p.id), [p.id]);
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
            { label: t("product.allFoods"), to: homePath(code) },
            ...(p.place?.aisle
              ? [
                  {
                    // Distinguish the broad category from its namesake food.
                    label:
                      p.place.aisle.name === food?.name
                        ? t("product.categoryOf", { name: p.place.aisle.name })
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
          <Notice tone="warn" title={t("product.historicalTitle")}>
            {t("product.historicalBody")}{" "}
            <Link to={productPath(code, p.slug)}>
              {t("product.viewCurrent")}
            </Link>
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
                {p.seasonal === 1 && <SeasonalBadge />}
                {!!p.developmentOnly && <Badge>{t("product.demo")}</Badge>}
              </p>
              <div className="va-product__title-row">
                <h1 className="va-product__name">{title}</h1>
                <SaveButton productId={p.id} productName={title} showListLink />
              </div>
              {p.flavor && (
                <p className="va-product__flavor va-muted">
                  {t("product.flavor", { flavor: p.flavor })}
                </p>
              )}
            </div>
            {food && (
              <section
                className="va-product__rating-area"
                aria-labelledby="ratings-title"
              >
                <h2 id="ratings-title" className="va-heading-s">
                  {t("product.ratings")}
                </h2>
                <ScoreCard country={code} food={food} brand={p.brand} />
                <div className="va-product__editor">
                  <h3 className="va-heading-s">{t("product.yourRating")}</h3>
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
                        ? t("product.ratingsUnavailable")
                        : t("product.historicalScores")}
                    </p>
                  )}
                </div>
                {food.ratingCount > 0 && (
                  <details className="va-product__rating-details">
                    <summary>{t("product.howRated")}</summary>
                    <RatingBreakdown food={food} />
                  </details>
                )}
                {food.rankedCount > 1 && (
                  <Link
                    className="va-link va-small"
                    to={foodPath(code, food.slug)}
                  >
                    {t("product.compareAll", {
                      total: food.rankedCount,
                      food: inSentence(food.name),
                    })}
                  </Link>
                )}
              </section>
            )}
            <div className="va-product__summary">
              {p.lifecycleStatus !== "active" && (
                <Notice>
                  {t("product.lifecycle", {
                    status: friendly(p.lifecycleStatus),
                  })}
                </Notice>
              )}
              {added && (
                <Notice
                  tone="success"
                  title={t("product.liveTitle")}
                  role="status"
                >
                  {t("product.liveThanks")}{" "}
                  {added.rated ? (
                    <>
                      {t("product.liveRated", { rating: added.rated })}{" "}
                      <a href="#scores-title">{t("product.liveAddDetail")}</a>{" "}
                      {t("product.liveIfYouLike")}
                    </>
                  ) : added.ratingPending ? (
                    <>{t("product.livePending")}</>
                  ) : (
                    food?.canRate && (
                      <>
                        {t("product.liveTried")}{" "}
                        <a href="#scores-title">{t("product.liveRateIt")}</a>{" "}
                        {t("product.liveJoins")}
                      </>
                    )
                  )}
                </Notice>
              )}
              {p.veganStatus === "under_review" && (
                <Notice tone="warn">{t("product.underReview")}</Notice>
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
                    {t("product.alsoRanked")}
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
                              {other.line?.closest
                                ? t("product.alsoRankedLine", {
                                    rank: other.line.closest.rank,
                                    of: other.line.closest.of,
                                    people: counted(
                                      "product.people",
                                      other.line.closest.people,
                                    ),
                                  })
                                : t("product.notRanked")}
                            </span>
                          </span>
                          {other.line?.closest && (
                            <ScoreLabel
                              value={other.line.closest.score!}
                              size="compact"
                            />
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="va-small">{t("product.ownRanking")}</p>
                </section>
              )}
              {p.lifecycleStatus === "active" && (
                <section
                  className="va-product__variants"
                  aria-labelledby="flavors-title"
                >
                  <h2 id="flavors-title" className="va-heading-s">
                    {t("product.otherFlavors")}
                  </h2>
                  {p.otherFlavors.length > 0 ? (
                    <ul className="va-divided va-product__flavors">
                      {p.otherFlavors.map((other) => (
                        <li key={other.id}>
                          <Link
                            className="va-product__flavor-link"
                            to={productPath(code, other.slug, other.food)}
                          >
                            <ProductThumbnail
                              imageId={other.imageId}
                              food={other.food ?? food?.slug ?? "food"}
                              size="small"
                            />
                            <span>
                              <strong>
                                {other.flavor ??
                                  productName(other.name, p.brand)}
                              </strong>
                              {other.flavor && (
                                <span className="va-small va-muted">
                                  {productName(other.name, p.brand)}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="va-small va-muted">
                      {t("product.noOtherFlavors")}
                    </p>
                  )}
                  <p className="va-small">
                    <Link
                      className="va-link"
                      to={`/add-product?country=${code}${food ? `&food=${food.slug}` : ""}&line=${p.lineId}`}
                    >
                      {t("product.addFlavor")}
                    </Link>
                  </p>
                </section>
              )}
            </div>
          </div>
          <div className="va-product__visuals">
            <ProductPhotos
              key={p.versionId}
              productId={p.id}
              productName={title}
              food={food?.slug ?? "food"}
              images={p.images}
              canPropose={
                Boolean(p.formula.isCurrent) && p.lifecycleStatus !== "hidden"
              }
              managedVersionId={p.formula.isCurrent ? p.versionId : undefined}
            />
            {food && p.others.length > 0 && (
              <section
                className="va-product__alternatives"
                aria-labelledby="others-title"
              >
                <div className="va-product__section-head">
                  <h2 id="others-title" className="va-heading-s">
                    {t("product.otherSwaps", { food: inSentence(food.name) })}
                  </h2>
                  <Link className="va-link" to={foodPath(code, food.slug)}>
                    {t("product.seeAll", { total: food.rankedCount })}
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
                          <span className="sr-only">{t("product.rank")}</span>#
                          {other.rank}
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
                            {counted("product.people", other.ratingCount)}
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

        <section className="va-product__facts" aria-labelledby="facts-title">
          <div>
            <h2 id="facts-title" className="va-heading-s">
              {t("product.facts")}
            </h2>
            <p className="va-small va-muted">
              {t("product.factsChecked")}{" "}
              <Link className="va-link" to={`/contribute/${p.id}`}>
                {t("product.suggestChange")}
              </Link>
            </p>
            <p className="va-small">
              <Link to={`/contribute/${p.id}?action=report`}>
                {t("product.report")}
              </Link>
            </p>
            <ProductAdminLink productId={p.id} />
          </div>
          <dl className="va-facts">
            <dt>{t("safety.veganStatus")}</dt>
            <dd>
              {veganStatusLabel(p.veganStatus)}.{" "}
              <span className="va-muted">
                {p.classification?.reviewed
                  ? t("product.classificationReviewed")
                  : p.formula.isCurrent
                    ? t("product.classificationProvisional")
                    : t("product.classificationRecorded")}
              </span>
            </dd>
            <dt>{t("product.packageLabel")}</dt>
            <dd>
              {MANUFACTURER_LABEL_KEYS[p.manufacturerLabel]
                ? t(MANUFACTURER_LABEL_KEYS[p.manufacturerLabel]!)
                : friendly(p.manufacturerLabel)}
            </dd>
            <dt>{t("safety.allergens")}</dt>
            <dd>
              {allergens ? (
                <AllergenLabel allergens={allergens} variant="line" />
              ) : (
                t("safety.notConfirmed")
              )}
              {t("text.stop")}
              <span className="va-muted">
                {p.allergens && p.allergenConfirmations
                  ? `${t("safety.confirmedBy", { members: counted("product.members", p.allergenConfirmations) })} `
                  : ""}
                {t("safety.checkPackage")}
              </span>{" "}
              {p.formula.isCurrent && (
                <Link
                  className="va-link"
                  to={`/contribute/${p.id}?action=change`}
                >
                  {p.allergens
                    ? t("product.correctAllergens")
                    : t("product.addAllergens")}
                </Link>
              )}
            </dd>
            <dt>{t("product.replaces")}</dt>
            <dd>
              {p.categories
                .filter((c) => c.isActive)
                .map((c) => inSentence(c.name))
                .join(t("list.separator")) || "—"}
            </dd>
            <dt>{t("product.recipe")}</dt>
            <dd>
              {t("product.recipeLine", {
                kind: p.formula.isCurrent
                  ? t("product.currentRecipe")
                  : t("product.earlierRecipe"),
                label: p.formula.versionLabel,
              })}{" "}
              <a className="va-link" href="#formula-history">
                {t("product.earlierRecipes")}
              </a>{" "}
              {t("product.keepRatings")}
            </dd>
            <dt>{t("product.soldIn")}</dt>
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
            <Notice title={t("safety.ingredientsUnchecked")}>
              {t("safety.uncheckedWithPhoto")}{" "}
              <Link
                to={`/contribute/${p.id}?action=change&kind=classification`}
              >
                {t("safety.checkIngredients")}
              </Link>{" "}
              {t("safety.memberCanConfirm")}
            </Notice>
          ) : (
            <Notice title={t("safety.ingredientsUnchecked")}>
              {t("safety.uncheckedNoPhoto")}{" "}
              <Link to={`/contribute/${p.id}?action=photo&slot=ingredients`}>
                {t("safety.addIngredientsPhoto")}
              </Link>{" "}
              {t("safety.memberCanConfirm")}
            </Notice>
          ))}

        <div className="va-product__more">
          {p.ingredientTranscription && (
            <details className="va-product__details">
              <summary>{t("product.transcribed")}</summary>
              <p className="va-small va-muted">
                {p.ingredientTranscription.verification === "online_only"
                  ? t("product.verifiedOnline")
                  : p.ingredientTranscription.verification === "no_source"
                    ? t("product.verifiedNoSource")
                    : t("product.verifiedFromLabel", {
                        status: friendly(
                          p.ingredientTranscription.verification,
                        ),
                      })}
              </p>
              {p.ingredientTranscription.ingredients ? (
                <p>{p.ingredientTranscription.ingredients}</p>
              ) : (
                <p>{t("product.noPackageList")}</p>
              )}
              {p.ingredientTranscription.onlineIngredients && (
                <div>
                  <h3 className="va-small">{t("product.onlineSupplement")}</h3>
                  <p>{p.ingredientTranscription.onlineIngredients}</p>
                  {p.ingredientTranscription.onlineContains && (
                    <p>
                      <strong>{t("safety.contains")}</strong>{" "}
                      {p.ingredientTranscription.onlineContains}
                    </p>
                  )}
                  {p.ingredientTranscription.onlineMayContain && (
                    <p>
                      <strong>{t("safety.mayContain")}</strong>{" "}
                      {p.ingredientTranscription.onlineMayContain}
                    </p>
                  )}
                </div>
              )}
              {p.ingredientTranscription.contains && (
                <p>
                  <strong>{t("safety.contains")}</strong>{" "}
                  {p.ingredientTranscription.contains}
                </p>
              )}
              {p.ingredientTranscription.mayContain && (
                <p>
                  <strong>{t("safety.mayContain")}</strong>{" "}
                  {p.ingredientTranscription.mayContain}
                </p>
              )}
              {p.ingredientTranscription.onlineSource && (
                <p>
                  {t("product.supplementedFrom", {
                    source: p.ingredientTranscription.onlineSource.productMatch,
                  })}{" "}
                  <a
                    href={p.ingredientTranscription.onlineSource.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("product.viewSource")}
                  </a>{" "}
                  {t("product.checkedOn", {
                    date: p.ingredientTranscription.onlineSource.accessedAt.slice(
                      0,
                      10,
                    ),
                  })}
                </p>
              )}
            </details>
          )}
          {p.classification && (
            <details className="va-product__details">
              <summary>{t("product.evidence")}</summary>
              <p>{p.classification.evidence.note}</p>
              {p.classification.evidence.urls.map((url, index) => (
                <p key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {t("product.evidenceSource", { number: index + 1 })}
                  </a>
                </p>
              ))}
              <h3 className="va-small">{t("product.certifications")}</h3>
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
                  {t("product.noCertification")}
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
              {t("product.whereFound")}
            </h2>
            <div className="va-product__section-body">
              <p className="va-small va-muted">
                {t("product.availabilityNote")}
              </p>
              {p.retailers.length ? (
                <ul className="va-divided">
                  {p.retailers.map((r) => (
                    <li key={r.id} className="va-product__retailer">
                      <strong>{r.name}</strong>
                      <span className="va-small va-muted">
                        {t("product.retailerLine", {
                          status: r.stale
                            ? t("product.notConfirmedRecently")
                            : t("product.recentlyConfirmed"),
                          contributors: counted(
                            "product.contributors",
                            r.contributorCount,
                          ),
                          date: dateLabel(r.lastConfirmedAt),
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t("product.noRetailers")}</p>
              )}
            </div>
          </section>
          {!!p.relatedProducts.length && (
            <section
              className="va-product__section"
              aria-labelledby="related-title"
            >
              <h2 id="related-title" className="va-heading-s">
                {t("product.related")}
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
                <p className="va-small va-muted">{t("product.ownRatings")}</p>
              </div>
            </section>
          )}
          <section
            id="formula-history"
            className="va-product__section"
            aria-labelledby="history-title"
          >
            <h2 id="history-title" className="va-heading-s">
              {t("product.formulaHistory")}
            </h2>
            <div className="va-product__section-body">
              <p className="va-small va-muted">{t("product.newFormula")}</p>
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
                      {v.isCurrent
                        ? t("product.current")
                        : t("product.historical")}
                      {v.effectiveDate
                        ? ` · ${t("product.effective", { date: v.effectiveDate, precision: friendly(v.effectiveDatePrecision) })}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="va-small va-muted">{p.formula.changeSummary}</p>
            </div>
          </section>

          {!!p.developmentOnly && (
            <p className="va-small va-muted">{t("product.demoCatalog")}</p>
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
  const lower = inSentence(food.name);
  const line = food.line;
  return (
    <div
      className="va-score-card"
      role="group"
      aria-label={t("product.communityRatings")}
    >
      <div className="va-score-card__standing">
        {line?.closest && (
          <Link
            className="va-score-card__flag"
            to={foodPath(country, food.slug)}
          >
            <RankFlag>
              {line.closest.rank === 1
                ? t("product.firstSwap", { food: lower })
                : t("product.rankOfFor", {
                    rank: line.closest.rank,
                    of: line.closest.of,
                    food: lower,
                  })}
            </RankFlag>
          </Link>
        )}
        {line && line.flavorCount > 1 && (
          <p className="va-score-card__context">
            {t("product.acrossFlavors", {
              total: line.flavorCount,
              name: productName(line.name, brand),
            })}
          </p>
        )}
      </div>
      <div className="va-score-card__metrics">
        {(
          [
            {
              id: "closest",
              label: t("product.closest"),
              description: t("product.toFood", { food: lower }),
              value: line?.closest,
              tone: "tag",
            },
            {
              id: "tastiest",
              label: t("product.tastiest"),
              description: t("product.onItsOwn"),
              value: line?.tastiest,
              tone: "tasty",
            },
          ] as const
        ).map((metric) => (
          <div className="va-score-card__metric" key={metric.id}>
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
                <UnratedScore />
              )}
              {metric.value && metric.value.people > 0 && (
                <div className="va-score-card__text">
                  <strong>
                    #{metric.value.rank} of {metric.value.of}
                  </strong>
                  <span>{counted("product.people", metric.value.people)}</span>
                  {metric.value.early && (
                    <EarlyBadge count={metric.value.people} />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {line && line.flavorCount > 1 && (
        <div className="va-score-card__flavor">
          <strong>{t("product.thisFlavor")}</strong>
          <div className="va-score-card__flavor-scores">
            {(["closest", "tastiest"] as const).map((metric) => {
              const own = food.flavorScores[metric];
              return (
                <div key={metric}>
                  <span>
                    {metric === "closest"
                      ? t("product.closest")
                      : t("product.tastiest")}
                  </span>
                  {own.count >= FLAVOR_SCORE_MIN_ANSWERS &&
                  own.score !== null ? (
                    <ScoreLabel
                      value={own.score}
                      size="mini"
                      tone={metric === "tastiest" ? "tasty" : "neutral"}
                    />
                  ) : own.count === 0 ? (
                    <UnratedScore />
                  ) : (
                    <span className="va-small va-muted">
                      {t("product.tooFew")}
                    </span>
                  )}
                  {own.count > 0 && (
                    <span className="va-small va-muted">
                      {counted("product.people", own.count)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function UnratedScore() {
  return (
    <span className="va-score-card__unrated">
      <span aria-hidden="true">—</span> {t("product.unrated")}
    </span>
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
        {t("product.breakdown")}
      </h3>
      <p className="va-small va-muted">
        {t("product.breakdownLine", {
          food: inSentence(food.name),
          people: counted("product.people", food.ratingCount),
        })}
      </p>
      <DistributionBars
        label={t("product.closenessRatings", {
          food: inSentence(food.name),
        })}
        rows={food.distribution.map((row) => ({
          label: `${row.score} · ${scoreMeanings()[row.score - 1]}`,
          count: row.count,
        }))}
      />
      {food.details.some((d) => d.mean !== null) && (
        <div className="va-product__detail-scores">
          <h3 className="va-heading-s">{t("product.closerLook")}</h3>
          <DetailBars details={food.details} />
          <p className="va-small va-muted">
            {t("product.detailFrom", {
              people: counted("product.people", detailCount),
            })}
          </p>
        </div>
      )}
      {food.recentEaters && (
        <p className="va-small va-muted">
          {t("product.recentEaters", { food: inSentence(food.name) })}{" "}
          <strong>{formatScore(food.recentEaters.average)}/5</strong>
          {t("text.open")}
          {counted("product.people", food.recentEaters.count)}
          {t("text.close")}
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
      {t("product.addRetailer")}
    </Link>
  );
  if (!retailers.length)
    return (
      <div className="va-store-toggles">
        <p className="va-small">{t("product.nobodyReported")}</p>
        <p>{add}</p>
      </div>
    );
  return (
    <div className="va-store-toggles">
      <div className="va-store-toggles__row">
        <span className="va-store-toggles__lead" id="found-at">
          {t("product.foundAt")}
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
                      <span className="va-store-toggles__yours">{` · ${t("product.yours")}`}</span>
                    )}
                  </button>
                ) : (
                  <span className="va-chip">{retailer.name}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p>{add}</p>
      <p className="va-small va-muted">{t("product.tapStores")}</p>
    </div>
  );
}
