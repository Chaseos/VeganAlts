import { env } from "cloudflare:workers";
import { Link, redirect, useLocation } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  catalogPage,
  categoryView,
  CATALOG_PAGE_SIZE,
  UnknownViewError,
} from "@server/catalog/application/service";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import { EmptyState } from "../components/ui/feedback";
import { Pagination } from "../components/ui/navigation";
import { ButtonLink } from "../components/ui/button";
import { CheckThePackage, SeasonBadge } from "../components/ui/badges";
import { seasonOf } from "@server/taxonomy/domain/season";
import { FoodIcon } from "../components/icons/food-icons";
import {
  FeaturedSwap,
  RankedRow,
  UnratedRow,
  sortNote,
} from "../components/catalog/ranking-list";
import { categorySummary } from "../lib/summaries";
import {
  formatScore,
  joinList,
  plural,
  withArticle,
  productName,
} from "../lib/format";
import {
  breadcrumbs,
  countryAlternates,
  itemList,
  publicMetadata,
} from "../lib/metadata";
import { COUNTRY_LAYOUT_ID, useSiteChrome } from "../lib/site-chrome";
import { hasFilters, readFilters } from "@server/catalog/domain/filters";
import {
  foodPath,
  homePath,
  parseCountryCode,
  productPath,
} from "@server/catalog/domain/markets";
import { Breadcrumb, TabLinks } from "../components/ui/navigation";
import { AislePanel } from "../components/catalog/aisle-panel";
import { PageShell } from "../components/layout/page-shell";
import {
  FreeFromChecklist,
  SortMenu,
  StoreChecklist,
  RankingResultCount,
} from "../components/catalog/ranking-filters";
import {
  filteredHref,
  saveFilters,
  useApplySavedFilters,
} from "../lib/ranking-filters";
import type { Route } from "./+types/category";

export async function loader({ request, params }: Route.LoaderArgs) {
  requireCatalogPreview(env);
  const catalog = catalogService(env);
  const country = parseCountryCode(params.country);
  // A renamed or merged category redirects (uncached) to its current slug.
  const moved = await catalog.categoryRedirect(params.categorySlug);
  if (moved)
    throw redirect(`/${country}/${moved}${new URL(request.url).search}`, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  return publicLoader(async () => {
    const url = new URL(request.url);
    const market = await catalog.market(country);
    // Aisles are groups with their own page; a deeper group (a retired shelf
    // from the three-level shape) opens its aisle, and Food itself is the
    // home page. The public boundary drops the old `?shelf=` parameter.
    if (!(await catalog.summary(market, params.categorySlug)).isRankable) {
      const place = await catalog.aisle(market, params.categorySlug);
      if (place.kind === "root") throw redirect(homePath(country));
      if (place.kind === "group")
        throw redirect(foodPath(country, place.aisleSlug), {
          status: 302,
          headers: { "Cache-Control": "private, no-store" },
        });
      return {
        ...place,
        market,
        origin: env.APP_URL,
        staging: env.APP_ENV !== "production",
      };
    }
    // Stores and allergens the country does not offer never become cache
    // variants: drop them with an uncached redirect.
    const checked = await catalog.validateFilters(
      market,
      readFilters(url.searchParams),
    );
    if (checked.changed)
      throw redirect(filteredHref(url.pathname, url.search, checked.filters), {
        status: 302,
        headers: { "Cache-Control": "private, no-store" },
      });
    const view = categoryView(url.searchParams.get("view"));
    const ranking = await catalog
      .category(market, params.categorySlug, {
        page: catalogPage(url.searchParams.get("page")),
        unrankedPage: catalogPage(url.searchParams.get("unrankedPage")),
        view,
        filters: checked.filters,
      })
      .catch((error: unknown) => {
        // A detail sort this food no longer asks falls back to the ranking.
        if (error instanceof UnknownViewError) {
          const params = new URLSearchParams(url.search);
          params.delete("view");
          params.delete("page");
          params.delete("_routes");
          throw redirect(
            `${url.pathname.replace(/\.data$/, "")}${params.size ? `?${params}` : ""}`,
            { status: 302, headers: { "Cache-Control": "private, no-store" } },
          );
        }
        throw error;
      });
    return {
      kind: "food" as const,
      ...ranking,
      market,
      allergenOptions: checked.options.allergens,
      origin: env.APP_URL,
      staging: env.APP_ENV !== "production",
    };
  });
}

// Switching country keeps the food.
export const handle = {
  countrySwitch: (data: unknown, code: string) => {
    const value = data as
      { category?: { slug: string }; aisle?: { slug: string } } | undefined;
    const slug = value?.category?.slug ?? value?.aisle?.slug;
    return slug ? foodPath(code, slug) : null;
  },
};

function viewQuery(view: string, page: number) {
  const params = new URLSearchParams();
  if (view !== "top") params.set("view", view);
  if (page > 1) params.set("page", String(page));
  return params.size ? `?${params}` : "";
}
export function meta({ loaderData, matches }: Route.MetaArgs) {
  const countries =
    (
      matches.find((match) => match?.id === COUNTRY_LAYOUT_ID)?.loaderData as
        { chrome?: { countries: { code: string }[] } | null } | undefined
    )?.chrome?.countries ?? [];
  const slug =
    loaderData?.kind === "aisle"
      ? loaderData.aisle.slug
      : loaderData?.kind === "food"
        ? loaderData.category.slug
        : null;
  // A food has versions only in the countries where it is on.
  const versions =
    loaderData?.kind === "food"
      ? countries.filter((country) =>
          loaderData.availability.countries.includes(country.code),
        )
      : countries;
  const alternates = slug
    ? countryAlternates(
        loaderData?.origin ?? "https://veganalts.com",
        versions,
        (code) => foodPath(code, slug),
      )
    : [];
  // A food that is not on here invites the first product but isn't indexed.
  const hidden =
    loaderData?.kind === "food" &&
    !loaderData.availability.here &&
    !loaderData.staging
      ? [{ name: "robots", content: "noindex" }]
      : [];
  return [...pageMeta(loaderData), ...alternates, ...hidden];
}
function pageMeta(loaderData: Route.MetaArgs["loaderData"]) {
  if (loaderData?.kind === "aisle")
    return publicMetadata(
      `${loaderData.aisle.name} aisle · Vegan swaps by food`,
      `Every food in the ${loaderData.aisle.name.toLowerCase()} aisle with its closest vegan swaps, ranked by people who’ve tried them.`,
      foodPath(loaderData.market.code, loaderData.aisle.slug),
      loaderData.origin,
      loaderData.staging,
    );
  const data = loaderData?.kind === "food" ? loaderData : undefined;
  const origin = data?.origin ?? "https://veganalts.com";
  const structured = data
    ? [
        breadcrumbs(origin, [
          { name: "Home", path: "/" },
          {
            name: data.category.name,
            path: foodPath(data.market.code, data.category.slug),
          },
        ]),
        ...(data.view === "top" && data.ranked.length
          ? [
              itemList(
                origin,
                `Top vegan alternatives to ${data.category.name}`,
                // Each line, linking its lead flavor.
                data.ranked.map((line) => ({
                  name: productName(line.name, line.brand),
                  path: productPath(data.market.code, line.leadProduct.slug),
                })),
                (data.page - 1) * CATALOG_PAGE_SIZE + 1,
              ),
            ]
          : []),
      ]
    : [];
  return [
    ...publicMetadata(
      data
        ? `Best vegan alternatives to ${data.category.name.toLowerCase()}`
        : "Food",
      `Compare vegan ${data?.category.name.toLowerCase() ?? "food"} alternatives, ranked by similarity with rating counts and formula details.`,
      // Filtered pages declare the unfiltered ranking canonical.
      data
        ? `${foodPath(data.market.code, data.category.slug)}${viewQuery(data.view, data.page)}`
        : "/",
      origin,
      data?.staging ?? true,
    ),
    ...structured,
  ];
}

type FoodData = Extract<Route.ComponentProps["loaderData"], { kind: "food" }>;
type AisleData = Extract<Route.ComponentProps["loaderData"], { kind: "aisle" }>;

export default function Category({ loaderData }: Route.ComponentProps) {
  return loaderData.kind === "aisle" ? (
    <AislePage data={loaderData} />
  ) : (
    <FoodRanking data={loaderData} />
  );
}

function AislePage({ data }: { data: AisleData }) {
  return (
    <PageShell width="wide" footer="compact">
      <Breadcrumb
        items={[
          { label: "All foods", to: homePath(data.market.code) },
          { label: data.aisle.name },
        ]}
      />
      <AislePanel country={data.market.code} data={data} mode="page" />
    </PageShell>
  );
}

/** A food that is not on in this country yet: invite its first product. */
function NotHereYet({ data }: { data: FoodData }) {
  const code = data.market.code;
  const food = data.category.name;
  const names = new Map(
    useSiteChrome().countries.map((country) => [country.code, country.name]),
  );
  const elsewhere = data.availability.countries[0];
  return (
    <PageShell width="wide">
      <div className="va-ranking__main">
        <header className="va-ranking__head">
          <Breadcrumb
            items={[
              { label: "All foods", to: homePath(code) },
              { label: food },
            ]}
          />
          <h1 className="va-ranking__title">
            Vegan alternatives to {food.toLowerCase()}
          </h1>
        </header>
        <EmptyState
          title={`Not in ${data.market.name} yet`}
          actions={
            <>
              <ButtonLink
                to={`/add-product?country=${code}&food=${data.category.slug}`}
              >
                Add a product
              </ButtonLink>
              {elsewhere && (
                <Link
                  className="button secondary"
                  to={foodPath(elsewhere, data.category.slug)}
                >
                  See it in {names.get(elsewhere) ?? elsewhere.toUpperCase()}
                </Link>
              )}
            </>
          }
        >
          Know a vegan {food.toLowerCase()} swap sold here? Add it and{" "}
          {food.toLowerCase()} opens in {data.market.name}.
        </EmptyState>
      </div>
    </PageShell>
  );
}

function FoodRanking({ data }: { data: FoodData }) {
  if (!data.availability.here) return <NotHereYet data={data} />;
  return <FoodRankingList data={data} />;
}

function FoodRankingList({ data }: { data: FoodData }) {
  const code = data.market.code;
  const food = data.category.name;
  const season = seasonOf(data.category.seasonStart, data.category.seasonEnd);
  const filtered = hasFilters(data.filters);
  const labels = Object.fromEntries(
    data.allergenOptions.map((option) => [option.key, option.label]),
  );
  useApplySavedFilters(code, {
    stores: data.storeOptions.map((store) => store.slug),
    freeFrom: data.allergenOptions.map((option) => option.key),
  });
  // The two rankings sit in the toggle; the other sorts reorder the lines
  // and never change a score.
  const tastiestView = data.view === "tastiest";
  const ranking = data.view === "top" || tastiestView;
  const sorts = [
    {
      view: ranking ? data.view : "top",
      label: "Ranking",
      hint: tastiestView ? "Tastiest" : "Closest to the original",
    },
    { view: "trending", label: "Trending", hint: "Rising this quarter" },
    { view: "new", label: "Newest", hint: "Recently added" },
    ...data.questions.map((question) => ({
      view: `detail-${question.key}`,
      label: `Closest ${question.label.toLowerCase()}`,
      hint: "Detail score",
    })),
    { view: "most-rated", label: "Most rated", hint: "Most people" },
  ];
  const activeDetail = data.view.startsWith("detail-")
    ? data.view.slice(7)
    : null;
  const question = data.questions.find((q) => q.key === activeDetail);
  const rankOf = (line: (typeof data.ranked)[number]) =>
    tastiestView ? line.tastiestRank : line.closestRank;
  // Each ranking's #1 card heads its first page, once it has one.
  const first = data.ranked[0];
  const featured =
    ranking && data.page === 1 && first && rankOf(first) !== null
      ? first
      : undefined;
  const rows = featured ? data.ranked.slice(1) : data.ranked;
  const freeLabel = data.filters.freeFrom
    .map((key) => `${(labels[key] ?? key).toLowerCase()}-free`)
    .join(", ");
  const flag =
    featured && rankOf(featured) === 1
      ? tastiestView
        ? "Tastiest #1"
        : "#1 swap"
      : `${tastiestView ? "Tastiest" : "Closest match"}${freeLabel ? ` · ${freeLabel}` : ""}`;
  const clearHref = foodPath(code, data.category.slug);
  const aislePath = data.place.aisle
    ? foodPath(code, data.place.aisle.slug)
    : homePath(code);
  return (
    <PageShell
      width="wide"
      phoneBack={{
        to: aislePath,
        label: data.place.aisle?.name ?? "All foods",
        context: data.place.aisle?.name ?? "",
      }}
      phoneTitle={
        <p className="va-ranking__phone-title" aria-hidden="true">
          Vegan alternatives to {food.toLowerCase()}
        </p>
      }
    >
      <div className="va-ranking">
        {data.sidebar.aisle && (
          <FoodSidebar
            country={code}
            current={data.category.slug}
            sidebar={data.sidebar}
          />
        )}
        <div className="va-ranking__main">
          <header className="va-ranking__head">
            <Breadcrumb
              items={[
                { label: "All foods", to: homePath(code) },
                ...(data.place.aisle
                  ? [
                      {
                        // "Eggs aisle / Eggs" rather than "Eggs / Eggs".
                        label:
                          data.place.aisle.name === food
                            ? `${food} aisle`
                            : data.place.aisle.name,
                        to: aislePath,
                      },
                    ]
                  : []),
                { label: food },
              ]}
            />
            <h1 className="va-ranking__title">
              Vegan alternatives to {food.toLowerCase()}
            </h1>
            {season && (
              <p className="va-ranking__season">
                <SeasonBadge season={season} />
              </p>
            )}
            <p className="va-ranking__summary">
              {categorySummary({
                food,
                // Tastiest counts only lines and people with its answers.
                rankedCount: tastiestView
                  ? data.summary.tastiestCount
                  : data.summary.rankedCount,
                people: tastiestView
                  ? data.summary.tastiestPeople
                  : data.summary.ratingCount,
                best: data.summary.best,
                tastiest: tastiestView,
              })}
            </p>
            <details className="va-ranking__how">
              <summary>How these scores work</summary>
              <p>
                People who’ve tried a product rate how close it is to{" "}
                {food.toLowerCase()} in the same flavor, from 1 to 5. A brand’s
                recipe and its flavors rank together: each person counts once,
                as the average of the flavors they rated, adjusted for how many
                people rated it. Swaps rated by fewer than 10 people show an
                Early badge. Tastiest ranks the optional “how tasty is it?”
                answers the same way and never changes Closest to the original.
                {data.questions.length > 0 &&
                  ` ${joinList(data.questions.map((q) => q.label.toLowerCase())).replace(/^./, (c) => c.toUpperCase())} are optional detail ratings that explain the score.`}{" "}
                Trending, Newest and detail sorts never change a ranking, and
                brands can’t pay to move up.
              </p>
            </details>
          </header>

          <RankingToggle current={data.view} />
          <div className="va-filter-bar">
            <SortMenu options={sorts} current={data.view} />
            <StoreChecklist
              country={code}
              countryName={data.market.name}
              stores={data.storeOptions}
              filters={data.filters}
            />
            {data.allergenOptions.length > 0 && (
              <FreeFromChecklist
                country={code}
                options={data.allergenOptions}
                filters={data.filters}
              />
            )}
            <RankingResultCount
              shown={data.shownCount}
              total={data.summary.rankedCount}
              filtered={filtered}
            />
          </div>
          {data.filters.freeFrom.length > 0 && (
            <CheckThePackage>
              Allergens come from package labels, confirmed by members against
              the label photo.
              {data.notConfirmedCount > 0 && (
                <>
                  {" "}
                  {plural(data.notConfirmedCount, "product")} without a
                  confirmed label {data.notConfirmedCount === 1 ? "is" : "are"}{" "}
                  hidden.{" "}
                  <Link
                    className="va-link"
                    to={filteredHref(
                      clearHref,
                      data.view === "top" ? "" : `?view=${data.view}`,
                      { ...data.filters, freeFrom: [] },
                    )}
                  >
                    Show {data.notConfirmedCount} not confirmed yet
                  </Link>
                </>
              )}
            </CheckThePackage>
          )}

          {data.view === "trending" && (
            <p className="va-small va-muted">
              Trending reflects the people rating, trying and discussing a swap
              over the last three months, compared with the three months before.
              It never changes a ranking.
            </p>
          )}
          {data.view === "new" && (
            <p className="va-small va-muted">
              Added in the last {data.newDays} days. Being new never raises a
              score.
            </p>
          )}

          {!data.ranked.length && data.page === 1 ? (
            filtered ? (
              <EmptyState
                title="No ranked swaps match your filters yet"
                actions={
                  <Link
                    className="button secondary"
                    to={clearHref}
                    onClick={() =>
                      saveFilters(code, { stores: [], freeFrom: [] })
                    }
                  >
                    Clear filters
                  </Link>
                }
              >
                A new product may still be waiting for its first rating. Check
                below, or loosen your filters.
              </EmptyState>
            ) : (
              <EmptyState
                title={
                  data.view === "trending"
                    ? "Nothing is trending right now"
                    : data.view === "new"
                      ? "No new swaps recently"
                      : `No ${food.toLowerCase()} swaps are ranked yet`
                }
                actions={
                  <ButtonLink
                    to={`/add-product?country=${code}&food=${data.category.slug}`}
                  >
                    Add a product
                  </ButtonLink>
                }
              >
                {data.view === "top"
                  ? "Rate one below, or add a product you’ve tried."
                  : "Closest match shows the long-term ranking."}
              </EmptyState>
            )
          ) : (
            <ol className="va-rank-list" start={(data.page - 1) * 20 + 1}>
              {featured && (
                <li>
                  <FeaturedSwap
                    country={code}
                    food={data.category.slug}
                    line={featured}
                    rank={rankOf(featured)}
                    flag={flag}
                    labels={labels}
                    stores={data.storeOptions}
                  />
                </li>
              )}
              {rows.map((line, index) => {
                const position = featured ? index + 1 : index;
                return (
                  <li key={line.lineId}>
                    {question && data.qualified === position && (
                      <p className="va-rank-list__divider">
                        These have fewer than 5 answers about{" "}
                        {question.label.toLowerCase()}, so they follow the
                        ranking.
                      </p>
                    )}
                    {tastiestView && data.qualified === position && (
                      <p className="va-rank-list__divider">
                        No one has said how tasty these are yet, so they follow
                        Closest to the original.
                      </p>
                    )}
                    <RankedRow
                      country={code}
                      food={data.category.slug}
                      line={line}
                      rank={rankOf(line)}
                      note={sortNote(data.view, line)}
                      activeDetail={activeDetail}
                      labels={labels}
                      stores={data.storeOptions}
                    />
                  </li>
                );
              })}
            </ol>
          )}
          <Pagination page={data.page} hasNext={data.hasNext} />

          {(data.unranked.length > 0 || data.unrankedPage > 1) && (
            <section
              className="va-ranking__unrated"
              aria-labelledby="unrated-title"
            >
              <h2 id="unrated-title" className="va-heading-s">
                Not rated yet
              </h2>
              <p className="va-muted">
                These have no ratings, so they aren’t ranked. Tried one?
              </p>
              <ul className="va-unrated-list">
                {data.unranked.map((line) => (
                  <UnratedRow
                    key={line.lineId}
                    country={code}
                    food={data.category.slug}
                    line={line}
                    labels={labels}
                  />
                ))}
              </ul>
              <Pagination
                page={data.unrankedPage}
                hasNext={data.hasNextUnranked}
                parameter="unrankedPage"
                label="Unrated products"
              />
            </section>
          )}
          <p className="va-ranking__add">
            Know {withArticle(food.toLowerCase())} swap that isn’t here?{" "}
            <Link
              className="va-link"
              to={`/add-product?country=${code}&food=${data.category.slug}`}
            >
              Add a product
            </Link>
            . Replacing something else?{" "}
            <Link className="va-link" to={`/propose-category?country=${code}`}>
              Suggest a food
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  );
}

/**
 * Closest to the original and Tastiest are the two rankings (milestone 7).
 * The toggle keeps the filters; any other sort leaves both unselected.
 */
function RankingToggle({ current }: { current: string }) {
  const location = useLocation();
  const href = (view: string) => {
    const params = new URLSearchParams(location.search);
    params.delete("page");
    params.delete("unrankedPage");
    if (view === "top") params.delete("view");
    else params.set("view", view);
    params.sort();
    return `${location.pathname}${params.size ? `?${params}` : ""}`;
  };
  return (
    <TabLinks
      label="Ranking"
      tabs={[
        {
          to: href("top"),
          label: "Closest to the original",
          current: current === "top",
        },
        {
          to: href("tastiest"),
          label: "Tastiest",
          current: current === "tastiest",
        },
      ]}
    />
  );
}

function FoodSidebar({
  country,
  current,
  sidebar,
}: {
  country: string;
  current: string;
  sidebar: FoodData["sidebar"];
}) {
  const aisle = sidebar.aisle!;
  return (
    <nav className="va-food-side" aria-label={`${aisle.name} aisle`}>
      <Link className="va-food-side__aisle" to={foodPath(country, aisle.slug)}>
        <FoodIcon slug={aisle.slug} size={20} />
        {aisle.name}
      </Link>
      <ul>
        {aisle.foods.map((food) => (
          <li key={food.slug}>
            <Link
              to={foodPath(country, food.slug)}
              aria-current={food.slug === current ? "page" : undefined}
            >
              <span>{food.name}</span>
              {food.score !== null && (
                <span className="va-food-side__score">
                  {formatScore(food.score)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {sidebar.otherAisles.length > 0 && (
        <div>
          <p className="va-overline">Other aisles</p>
          <ul>
            {sidebar.otherAisles.map((other) => (
              <li key={other.slug}>
                <Link to={foodPath(country, other.slug)}>{other.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
