import { env } from "cloudflare:workers";
import { useCallback, useState } from "react";
import { Link, redirect } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { catalogIsPublic } from "@server/shared/domain/launch";
import { ComingSoon } from "../components/coming-soon";
import { PageShell } from "../components/layout/page-shell";
import { InstantSearch } from "../components/catalog/instant-search";
import { ProductThumbnail } from "../components/catalog/product-thumbnail";
import { FoodIcon } from "../components/icons/food-icons";
import { Icon } from "../components/icons/icon";
import { ScoreLabel, RankFlag } from "../components/ui/score";
import {
  Badge,
  EarlyBadge,
  SeasonBadge,
  TrendingBadge,
} from "../components/ui/badges";
import { BROWSE_AISLE_FOODS } from "@server/ranking/domain/display";
import type { Season } from "@server/taxonomy/domain/season";
import { ButtonLink } from "../components/ui/button";
import { publicMetadata } from "../lib/metadata";
import { formatCount, plural, shortDate, productName } from "../lib/format";
import { POPULAR_AISLE_COUNT } from "../lib/aisles";
import type { SuggestedFood } from "../lib/instant-search";
import {
  foodPath,
  homePath,
  productPath,
  searchPath,
} from "../lib/site-chrome";
import { useFoodHref } from "../lib/ranking-filters";
import { useRememberedCountry } from "../lib/country-memory";
import type { Route } from "./+types/home";

export async function loader({ params }: Route.LoaderArgs) {
  // The United States home lives at "/".
  if (params.country?.toLowerCase() === "us") throw redirect("/", 301);
  const base = { staging: env.APP_ENV !== "production", origin: env.APP_URL };
  if (!catalogIsPublic(env)) return { ...base, market: null, catalog: null };
  return publicLoader(async () => {
    const catalog = catalogService(env);
    const market = await catalog.market(params.country ?? "us");
    return { ...base, market, catalog: await catalog.home(market) };
  });
}
export function meta({ loaderData }: Route.MetaArgs) {
  const market = loaderData?.market;
  return publicMetadata(
    market && market.code !== "us"
      ? `Find the closest vegan alternative in ${market.name}`
      : "Find the closest vegan alternative",
    "Search a food you already buy and see the vegan products people say come closest, ranked.",
    homePath(market?.code ?? "us"),
    loaderData?.origin ?? "https://veganalts.com",
    loaderData?.staging ?? true,
  );
}

type Home = NonNullable<Route.ComponentProps["loaderData"]["catalog"]>;
type Leader = Home["startWithThese"][number];

// The country home (canvas: Home5, PHome5).
export default function HomePage({ loaderData }: Route.ComponentProps) {
  useRememberedCountry(!loaderData.market || loaderData.market.code === "us");
  const [preview, setPreview] = useState<SuggestedFood | null>(null);
  const onPreview = useCallback(
    (food: SuggestedFood | null) => setPreview(food),
    [],
  );
  if (!loaderData.catalog || !loaderData.market) return <ComingSoon />;
  const home = loaderData.catalog;
  const code = loaderData.market.code;
  // Only a country without any products gets the first-product page; one
  // whose products await ratings lists them under New and needs ratings.
  if (home.counts.products === 0)
    return (
      <PageShell search={false}>
        <EmptyCountry name={loaderData.market.name} code={code} />
        {home.aisles.length > 0 && (
          <BrowseAisles country={code} aisles={home.aisles} empty />
        )}
      </PageShell>
    );
  return (
    <PageShell width="full" search={false}>
      <div className="va-home-hero">
        <div className="va-container va-home-hero__inner">
          <section
            className="va-home-hero__search va-kale"
            aria-labelledby="home-title"
          >
            <p className="va-home-hero__eyebrow">
              {plural(home.counts.foods, "food")} ·{" "}
              {formatCount(home.counts.products)} vegan products, rated by
              people who’ve tried them
            </p>
            <h1 id="home-title" className="va-home-hero__title">
              What do you want to swap?
            </h1>
            <p className="va-home-hero__lede">
              Search a food you already buy. You’ll see the vegan products
              people say come closest, ranked.
            </p>
            <InstantSearch
              country={code}
              variant="hero"
              id="home-search"
              onPreview={onPreview}
            />
            {home.tryFoods.length > 0 && (
              <p className="va-home-hero__try">
                <span>Try</span>
                {home.tryFoods.slice(0, 5).map((food) => (
                  <Link
                    key={food.slug}
                    className="va-chip va-chip--on-kale"
                    to={foodPath(code, food.slug)}
                  >
                    {food.name}
                  </Link>
                ))}
              </p>
            )}
          </section>
          {preview ? (
            <FoodPreview country={code} food={preview} />
          ) : (
            home.startWithThese.length > 0 && (
              <StartWithThese country={code} leaders={home.startWithThese} />
            )
          )}
        </div>
      </div>

      <div className="va-container va-home">
        <BrowseAisles country={code} aisles={home.aisles} />

        <div className="va-home__pair">
          {home.trending.length > 0 && (
            <section
              className="va-card va-home__card"
              aria-labelledby="trending-title"
            >
              <div className="va-home__card-head">
                <h2 id="trending-title" className="va-heading-s">
                  Trending now
                </h2>
                <span className="va-small va-muted">
                  Rising this quarter · never changes rankings
                </span>
              </div>
              <ol className="va-trending">
                {home.trending.map((product) => (
                  <li key={product.id}>
                    <Link
                      className="va-row-link"
                      to={productPath(code, product.slug, product.foodSlug)}
                    >
                      <ProductThumbnail
                        imageId={product.imageId}
                        food={product.foodSlug}
                        size="small"
                      />
                      <span className="va-row-link__text">
                        <span className="va-row-link__title">
                          {productName(product.name, product.brand)}
                        </span>
                        <span className="va-small va-muted">
                          For {product.foodName.toLowerCase()} ·{" "}
                          {product.recentRatingCount > 0
                            ? `${plural(product.recentRatingCount, "person", "people")} this week`
                            : "rising this quarter"}
                        </span>
                      </span>
                      {product.bayesianScore !== null &&
                        product.ratingCount > 0 && (
                          <ScoreLabel
                            value={product.bayesianScore}
                            size="compact"
                          />
                        )}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {home.newest.length > 0 && (
            <section
              className="va-card va-home__card"
              aria-labelledby="new-title"
            >
              <div className="va-home__card-head">
                <h2 id="new-title" className="va-heading-s">
                  New and needs ratings
                </h2>
                <span className="va-small va-muted">
                  Added in the last {home.newDays} days
                </span>
              </div>
              <ul className="va-divided">
                {home.newest.map((product) => (
                  <li key={product.id} className="va-new-row">
                    <Link
                      to={productPath(code, product.slug, product.foodSlug)}
                      aria-label={`View ${productName(product.name, product.brand)}`}
                    >
                      <ProductThumbnail
                        imageId={product.imageId}
                        food={product.foodSlug}
                        size="small"
                      />
                    </Link>
                    <span className="va-row-link__text">
                      <Link
                        className="va-row-link__title"
                        to={productPath(code, product.slug, product.foodSlug)}
                      >
                        {productName(product.name, product.brand)}
                      </Link>
                      <span className="va-chip-row va-small va-muted">
                        {product.ratingCount > 0 ? (
                          <EarlyBadge count={product.ratingCount} />
                        ) : (
                          <strong>No ratings yet</strong>
                        )}
                        <span>
                          For {product.foodName.toLowerCase()} · added{" "}
                          {shortDate(product.publishedAt ?? 0)}
                        </span>
                      </span>
                    </span>
                    <ButtonLink
                      variant="secondary"
                      small
                      to={`${productPath(code, product.slug, product.foodSlug)}#scores-title`}
                    >
                      Rate it
                      <span className="sr-only">
                        : {productName(product.name, product.brand)}
                      </span>
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {home.stillWaiting.length > 0 && (
          <section
            className="va-card va-home__waiting"
            aria-labelledby="waiting-title"
          >
            <div className="va-home__waiting-intro">
              <h2 id="waiting-title" className="va-heading-s">
                Still waiting for a great swap
              </h2>
              <p className="va-muted">
                The best option for these foods scores under 3.5, or nothing is
                ranked yet. Know a better one? Add it and it joins the ranking.
              </p>
              <ButtonLink small to={`/add-product?country=${code}`}>
                Add a product
              </ButtonLink>
            </div>
            <ul className="va-home__waiting-list">
              {home.stillWaiting.map((leader) => (
                <li key={leader.food.slug}>
                  <FoodRow
                    country={code}
                    food={leader.food}
                    best={leader.best}
                    neutral
                    prefix="Best so far: "
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}

type Aisle = Home["aisles"][number];
/**
 * The leading aisles in the country's popularity order, with the full
 * directory one click away, including in countries awaiting products.
 */
function BrowseAisles({
  country,
  aisles,
  empty = false,
}: {
  country: string;
  aisles: Aisle[];
  empty?: boolean;
}) {
  return (
    <section
      id="browse"
      aria-labelledby="browse-title"
      // The page shell already provides the gutter around an empty country.
      className={empty ? "va-home" : undefined}
    >
      <div className="va-home__heading">
        <h2 id="browse-title" className="va-home__title">
          Popular aisles
        </h2>
        <p className="va-muted">
          {empty
            ? "Open a food to add the first product people can rate here."
            : "Each food shows its closest swap."}
        </p>
      </div>
      <Link className="va-link va-browse__all" to={searchPath(country)}>
        Browse all aisles <Icon name="arrowRight" size={16} />
      </Link>
      {/* Phones: an accordion of aisles. Desktop: popular aisles in columns. */}
      <ul className="va-browse va-browse--phone">
        {aisles.slice(0, POPULAR_AISLE_COUNT).map((aisle) => (
          <li key={aisle.slug} className="va-browse__aisle">
            <details className="va-browse__details">
              <summary className="va-browse__summary">
                <AisleTitle aisle={aisle} />
                <Icon
                  name="chevronDown"
                  size={14}
                  strokeWidth={3}
                  className="va-browse__chevron"
                />
              </summary>
              <AisleFoods country={country} aisle={aisle} empty={empty} />
            </details>
          </li>
        ))}
      </ul>
      <ul className="va-browse va-browse--desktop">
        {aisles.slice(0, POPULAR_AISLE_COUNT).map((aisle) => (
          <li key={aisle.slug} className="va-browse__aisle">
            <Link
              className="va-browse__summary"
              to={foodPath(country, aisle.slug)}
            >
              <AisleTitle aisle={aisle} />
            </Link>
            <AisleFoods country={country} aisle={aisle} empty={empty} />
          </li>
        ))}
      </ul>
      <p className="va-home__suggest">
        Don’t see the food you’re replacing?{" "}
        <Link className="va-link" to={`/propose-category?country=${country}`}>
          Suggest a food
        </Link>{" "}
        and it gets its own ranking.
      </p>
    </section>
  );
}
function AisleTitle({ aisle }: { aisle: Aisle }) {
  return (
    <>
      <span className="va-browse__tile" aria-hidden="true">
        <FoodIcon slug={aisle.slug} size={22} />
      </span>
      <span className="va-browse__name">{aisle.name}</span>
      <span className="va-browse__count">
        {plural(aisle.foodCount, "food")}
      </span>
    </>
  );
}
function AisleFoods({
  country,
  aisle,
  empty = false,
}: {
  country: string;
  aisle: Aisle;
  empty?: boolean;
}) {
  // Each card shows the aisle's three most popular foods, then "See all"
  // (owner decision, 2026-10-12).
  const shown = aisle.foods.slice(0, BROWSE_AISLE_FOODS);
  return (
    <div className="va-browse__foods">
      <ul className="va-divided">
        {shown.map((food) => (
          <li key={food.slug}>
            <FoodRow
              country={country}
              food={food}
              best={food.best}
              // A food with an unrated product isn't waiting for one.
              missing={
                empty && !food.productCount
                  ? "Be the first to add one"
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
      {aisle.foods.length > shown.length && (
        <Link
          className="va-link va-browse__more"
          to={foodPath(country, aisle.slug)}
        >
          See all {aisle.foods.length} {aisle.name.toLowerCase()} foods
          <Icon name="arrowRight" size={14} />
        </Link>
      )}
    </div>
  );
}

function StartWithThese({
  country,
  leaders,
}: {
  country: string;
  leaders: Leader[];
}) {
  return (
    <section
      className="va-home-panel"
      aria-labelledby="start-title"
      aria-live="off"
    >
      <h2 id="start-title" className="va-heading-s">
        New to this? Start with these
      </h2>
      <p className="va-muted">
        The closest matches on the site, so the switch barely registers.
      </p>
      <ol className="va-divided">
        {leaders.map((leader) => (
          <li key={leader.food.slug}>
            <StartRow country={country} leader={leader} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function StartRow({ country, leader }: { country: string; leader: Leader }) {
  const href = useFoodHref(country, foodPath(country, leader.food.slug));
  return (
    <Link className="va-row-link va-row-link--tall" to={href}>
      {leader.best && (
        <ProductThumbnail
          imageId={leader.best.imageId}
          food={leader.food.slug}
          size="small"
        />
      )}
      <span className="va-row-link__text">
        <span className="va-small va-muted">
          Instead of {leader.food.name.toLowerCase()}
        </span>
        <span className="va-row-link__title va-row-link__title--large">
          {leader.best && productName(leader.best.name, leader.best.brand)}
        </span>
      </span>
      {leader.best && (
        <ScoreLabel
          value={leader.best.score}
          size="medium"
          className="va-home-start__score"
        />
      )}
    </Link>
  );
}

// One food with its closest swap, as a link to its ranking.
function FoodRow({
  country,
  food,
  best,
  neutral = false,
  prefix = "",
  missing = "No ranked swaps yet",
}: {
  country: string;
  food: { slug: string; name: string; season?: Season | null };
  best: Leader["best"];
  neutral?: boolean;
  prefix?: string;
  // What the row says when nothing is ranked.
  missing?: string;
}) {
  const href = useFoodHref(country, foodPath(country, food.slug));
  return (
    <Link className="va-row-link" to={href}>
      {best && (
        <ProductThumbnail
          imageId={best.imageId}
          food={food.slug}
          size="small"
        />
      )}
      <span className="va-row-link__text">
        <span className="va-row-link__title">
          {food.name}
          {food.season && (
            <>
              {" "}
              <SeasonBadge season={food.season} />
            </>
          )}
        </span>
        <span className="va-small va-muted">
          {best ? `${prefix}${productName(best.name, best.brand)}` : missing}
        </span>
        {best?.trending && (
          <span className="va-chip-row">
            <TrendingBadge />
          </span>
        )}
      </span>
      {best && (
        <ScoreLabel
          value={best.score}
          size="compact"
          tone={neutral ? "neutral" : "tag"}
        />
      )}
    </Link>
  );
}

// The desktop preview of the highlighted search result.
function FoodPreview({
  country,
  food,
}: {
  country: string;
  food: SuggestedFood;
}) {
  return (
    <section
      className="va-home-panel"
      aria-label={`Top swaps for ${food.name}`}
    >
      <div>
        <p className="va-small va-muted">Top swaps for</p>
        <h2 className="va-heading-m">{food.name}</h2>
        <p className="va-small va-muted">
          {[food.aisle, plural(food.rankedCount, "ranked swap")]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      {food.top.length ? (
        <ol className="va-divided va-preview-list">
          {food.top.map((product) => (
            <li key={product.slug}>
              <span
                className={`va-food-card__rank${product.rank === 1 ? " va-food-card__rank--first" : ""}`}
              >
                {product.rank}
              </span>
              <ProductThumbnail
                imageId={product.imageId}
                food={food.slug}
                size="small"
              />
              <span className="va-truncate">
                {productName(product.name, product.brand)}
              </span>
              {product.early && <Badge tone="early">Early</Badge>}
              <ScoreLabel
                value={product.score}
                size="compact"
                tone={product.rank === 1 ? "tag" : "neutral"}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="va-muted">No ranked swaps yet.</p>
      )}
      <ButtonLink to={foodPath(country, food.slug)}>
        {food.rankedCount
          ? `See all ${plural(food.rankedCount, `${food.name.toLowerCase()} swap`)}`
          : `Open ${food.name.toLowerCase()}`}
      </ButtonLink>
      <p className="va-small va-muted">
        Point at another food in the list to preview it.
      </p>
    </section>
  );
}

// "No rankings in Canada yet": each country's catalog comes from people who
// live there, so an empty one invites them to add the first products.
function EmptyCountry({ name, code }: { name: string; code: string }) {
  return (
    <section className="va-empty-country" aria-labelledby="empty-country-title">
      <p className="eyebrow">{name}</p>
      <h1 id="empty-country-title" className="va-display-l">
        No rankings in {name} yet
      </h1>
      <p className="va-body-l">
        Rankings here come from people who live in {name}. Add a vegan product
        you buy, or suggest a food it replaces, and it gets its own ranking once
        people rate it.
      </p>
      <div className="button-row">
        <ButtonLink to={`/add-product?country=${code}`}>
          Add the first product
        </ButtonLink>
        <ButtonLink
          to={`/propose-category?country=${code}`}
          variant="secondary"
        >
          Suggest a food
        </ButtonLink>
      </div>
    </section>
  );
}
