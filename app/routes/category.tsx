import { env } from "cloudflare:workers";
import { Link, redirect } from "react-router";
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
import { CheckThePackage } from "../components/ui/badges";
import { FoodIcon } from "../components/icons/food-icons";
import {
  FeaturedSwap,
  RankedRow,
  UnratedRow,
  sortNote,
} from "../components/catalog/ranking-list";
import { categorySummary } from "../lib/summaries";
import { formatScore, joinList, plural } from "../lib/format";
import { breadcrumbs, itemList, publicMetadata } from "../lib/metadata";
import { hasFilters, readFilters } from "@server/catalog/domain/filters";
import {
  foodPath,
  homePath,
  parseCountryCode,
  productPath,
} from "@server/catalog/domain/markets";
import { Breadcrumb } from "../components/ui/navigation";
import { AislePanel } from "../components/catalog/aisle-panel";
import { PageShell } from "../components/layout/page-shell";
import {
  FreeFromChecklist,
  SortMenu,
  StoreChecklist,
  resultCount,
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
    // Aisles and shelves are groups: an aisle has its own page, a shelf opens
    // its aisle with that shelf selected, and Food itself is the home page.
    if (!(await catalog.summary(market, params.categorySlug)).isRankable) {
      const place = await catalog.aisle(market, params.categorySlug);
      if (place.kind === "root") throw redirect(homePath(country));
      if (place.kind === "shelf")
        throw redirect(
          `${foodPath(country, place.aisleSlug)}${place.shelfSlug ? `?shelf=${place.shelfSlug}` : ""}`,
          { status: 302, headers: { "Cache-Control": "private, no-store" } },
        );
      const shelf = url.searchParams.get("shelf");
      if (shelf !== null && !place.shelves.some((s) => s.slug === shelf))
        throw redirect(foodPath(country, place.aisle.slug), {
          status: 302,
          headers: { "Cache-Control": "private, no-store" },
        });
      return {
        ...place,
        market,
        shelf,
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
export function meta({ loaderData }: Route.MetaArgs) {
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
                data.ranked.map((p) => ({
                  name: p.name,
                  path: productPath(data.market.code, p.slug),
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
        : "Category",
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
      <AislePanel
        country={data.market.code}
        data={data}
        shelf={data.shelf}
        mode="page"
      />
    </PageShell>
  );
}

function FoodRanking({ data }: { data: FoodData }) {
  const code = data.market.code;
  const food = data.category.name;
  const filtered = hasFilters(data.filters);
  const labels = Object.fromEntries(
    data.allergenOptions.map((option) => [option.key, option.label]),
  );
  useApplySavedFilters(code, {
    stores: data.storeOptions.map((store) => store.slug),
    freeFrom: data.allergenOptions.map((option) => option.key),
  });
  const sorts = [
    { view: "top", label: "Closest match", hint: "The ranking" },
    { view: "trending", label: "Trending", hint: "Rising this week" },
    { view: "new", label: "Newest", hint: "Recently added" },
    ...data.questions.map((question) => ({
      view: `detail-${question.key}`,
      label: `Best ${question.label.toLowerCase()}`,
      hint: "Detail score",
    })),
    { view: "most-rated", label: "Most rated", hint: "Most ratings" },
  ];
  const activeDetail = data.view.startsWith("detail-")
    ? data.view.slice(7)
    : null;
  const question = data.questions.find((q) => q.key === activeDetail);
  // The #1 card only heads Closest match on its first page.
  const featured =
    data.view === "top" && data.page === 1 ? data.ranked[0] : undefined;
  const rows = featured ? data.ranked.slice(1) : data.ranked;
  const freeLabel = data.filters.freeFrom
    .map((key) => `${(labels[key] ?? key).toLowerCase()}-free`)
    .join(", ");
  const flag =
    featured?.topRank === 1
      ? "#1 swap"
      : `Closest match${freeLabel ? ` · ${freeLabel}` : ""}`;
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
        context: [data.place.aisle?.name, data.place.shelf?.name]
          .filter(Boolean)
          .join(" · "),
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
                  ? [{ label: data.place.aisle.name, to: aislePath }]
                  : []),
                ...(data.place.shelf && data.place.aisle
                  ? [
                      {
                        label: data.place.shelf.name,
                        to: `${aislePath}?shelf=${data.place.shelf.slug}`,
                      },
                    ]
                  : []),
                { label: food },
              ]}
            />
            <h1 className="va-ranking__title">
              Vegan alternatives to {food.toLowerCase()}
            </h1>
            <p className="va-ranking__summary">
              {categorySummary({
                food,
                rankedCount: data.summary.rankedCount,
                ratingCount: data.summary.ratingCount,
                best: data.summary.best,
              })}
            </p>
            <details className="va-ranking__how">
              <summary>How these scores work</summary>
              <p>
                People who’ve tried a product rate how close it is to{" "}
                {food.toLowerCase()}, from 1 to 5. That overall score sets the
                ranking, adjusted for how many ratings a product has. Products
                with fewer than 10 ratings show an Early badge.
                {data.questions.length > 0 &&
                  ` ${joinList(data.questions.map((q) => q.label.toLowerCase())).replace(/^./, (c) => c.toUpperCase())} are optional detail ratings that explain the score.`}{" "}
                Trending, Newest and detail sorts never change the ranking, and
                brands can’t pay to move up.
              </p>
            </details>
          </header>

          <div className="va-filter-bar">
            <SortMenu options={sorts} current={data.view} />
            <StoreChecklist
              country={code}
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
            <span className="va-filter-bar__count">
              {resultCount(data.shownCount, data.summary.rankedCount, filtered)}
            </span>
          </div>
          <p className="va-filter-note">
            Your stores and filters are saved on this device and apply to every
            ranking. A product shows if it’s commonly found at any of your
            stores. Stores listed are the ones members report in{" "}
            {data.market.name}.
          </p>
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
              Trending reflects recent ratings, tries and discussion compared
              with the week before. It never changes the Top ranking.
            </p>
          )}
          {data.view === "new" && (
            <p className="va-small va-muted">
              Added in the last {data.newDays} days. Being new never raises a
              Top score.
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
                    to={`/add-product?category=${data.category.id}&country=${code}`}
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
                    product={featured}
                    flag={flag}
                    labels={labels}
                    stores={data.storeOptions}
                  />
                </li>
              )}
              {rows.map((product, index) => {
                const position = featured ? index + 1 : index;
                return (
                  <li key={product.id}>
                    {question && data.qualified === position && (
                      <p className="va-rank-list__divider">
                        These have fewer than 5 answers about{" "}
                        {question.label.toLowerCase()}, so they follow the
                        ranking.
                      </p>
                    )}
                    <RankedRow
                      country={code}
                      food={data.category.slug}
                      product={product}
                      note={sortNote(data.view, product)}
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
                {data.unranked.map((product) => (
                  <UnratedRow
                    key={product.id}
                    country={code}
                    food={data.category.slug}
                    product={{
                      ...product,
                      publishedAt: product.publishedAt ?? null,
                      topRank: null,
                      bayesianScore: null,
                      ratingCount: 0,
                      recentRatingCount: 0,
                      early: false,
                      matchedStores: [],
                    }}
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
            Know a {food.toLowerCase()} swap that isn’t here?{" "}
            <Link
              className="va-link"
              to={`/add-product?category=${data.category.id}&country=${code}`}
            >
              Add a product
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
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
      {aisle.shelves.map((shelf) => (
        <div key={shelf.slug}>
          <p className="va-overline">{shelf.name}</p>
          <ul>
            {shelf.foods.map((food) => (
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
        </div>
      ))}
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
