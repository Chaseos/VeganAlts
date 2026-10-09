import { env } from "cloudflare:workers";
import { useCallback, useState } from "react";
import { Link, redirect } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { catalogIsPublic } from "@server/shared/domain/launch";
import { ComingSoon } from "../components/coming-soon";
import { PageShell } from "../components/layout/page-shell";
import { InstantSearch } from "../components/catalog/instant-search";
import { FoodIcon } from "../components/icons/food-icons";
import { Icon } from "../components/icons/icon";
import { ScoreLabel, RankFlag } from "../components/ui/score";
import { Badge, EarlyBadge } from "../components/ui/badges";
import { ButtonLink } from "../components/ui/button";
import { publicMetadata } from "../lib/metadata";
import { formatCount, plural, shortDate } from "../lib/format";
import type { SuggestedFood } from "../lib/instant-search";
import {
  foodPath,
  homePath,
  productPath,
  useSiteChrome,
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
  const { country } = useSiteChrome();
  useRememberedCountry(!loaderData.market || loaderData.market.code === "us");
  const [preview, setPreview] = useState<SuggestedFood | null>(null);
  const onPreview = useCallback(
    (food: SuggestedFood | null) => setPreview(food),
    [],
  );
  if (!loaderData.catalog || !loaderData.market) return <ComingSoon />;
  const home = loaderData.catalog;
  const code = loaderData.market.code;
  if (!country.hasRankings)
    return (
      <PageShell search={false}>
        <EmptyCountry name={loaderData.market.name} code={code} />
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
        <section id="browse" aria-labelledby="browse-title">
          <div className="va-home__heading">
            <h2 id="browse-title" className="va-home__title">
              Browse every food
            </h2>
            <p className="va-muted">
              Aisle, then shelf, then food. Each food shows its closest swap.
            </p>
          </div>
          {/* Phones: an accordion of aisles. Desktop: every aisle in columns. */}
          <ul className="va-browse va-browse--phone">
            {home.aisles.map((aisle) => (
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
                  <AisleFoods country={code} aisle={aisle} />
                </details>
              </li>
            ))}
          </ul>
          <ul className="va-browse va-browse--desktop">
            {home.aisles.map((aisle) => (
              <li key={aisle.slug} className="va-browse__aisle">
                <Link
                  className="va-browse__summary"
                  to={foodPath(code, aisle.slug)}
                >
                  <AisleTitle aisle={aisle} />
                </Link>
                <AisleFoods country={code} aisle={aisle} />
              </li>
            ))}
          </ul>
          <p className="va-home__suggest">
            Don’t see the food you’re replacing?{" "}
            <Link className="va-link" to={`/propose-category?country=${code}`}>
              Suggest a food
            </Link>{" "}
            and it gets its own ranking.
          </p>
        </section>

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
                  Rising this week · never changes rankings
                </span>
              </div>
              <ol className="va-trending">
                {home.trending.map((product) => (
                  <li key={product.id}>
                    <Link
                      className="va-row-link"
                      to={productPath(code, product.slug)}
                    >
                      <Icon name="trend" size={20} className="va-good-icon" />
                      <span className="va-row-link__text">
                        <span className="va-row-link__title">
                          {product.name}
                        </span>
                        <span className="va-small va-muted">
                          For {product.foodName.toLowerCase()} ·{" "}
                          {product.recentRatingCount > 0
                            ? `+${plural(product.recentRatingCount, "rating")} this week`
                            : "rising this week"}
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
                    <span className="va-row-link__text">
                      <Link
                        className="va-row-link__title"
                        to={productPath(code, product.slug)}
                      >
                        {product.name}
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
                      to={`${productPath(code, product.slug)}#scores-title`}
                    >
                      Rate it<span className="sr-only">: {product.name}</span>
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
function AisleFoods({ country, aisle }: { country: string; aisle: Aisle }) {
  return (
    <div className="va-browse__shelves">
      {aisle.shelves.map((shelf) => (
        <section key={shelf.slug} aria-label={`${aisle.name}: ${shelf.name}`}>
          <p className="va-overline">{shelf.name}</p>
          <ul className="va-divided">
            {shelf.foods.map((food) => (
              <li key={food.slug}>
                <FoodRow country={country} food={food} best={food.best} />
              </li>
            ))}
          </ul>
        </section>
      ))}
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
      <span className="va-row-link__text">
        <span className="va-small va-muted">
          Instead of {leader.food.name.toLowerCase()}
        </span>
        <span className="va-row-link__title va-row-link__title--large">
          {leader.best?.name}
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
}: {
  country: string;
  food: { slug: string; name: string };
  best: Leader["best"];
  neutral?: boolean;
  prefix?: string;
}) {
  const href = useFoodHref(country, foodPath(country, food.slug));
  return (
    <Link className="va-row-link" to={href}>
      <span className="va-row-link__text">
        <span className="va-row-link__title">{food.name}</span>
        <span className="va-small va-muted va-truncate">
          {best ? `${prefix}${best.name}` : "No ranked swaps yet"}
        </span>
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
          {[food.aisle, plural(food.rankedCount, "ranked product")]
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
              <span className="va-truncate">{product.name}</span>
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
