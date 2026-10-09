import { env } from "cloudflare:workers";
import { Link, redirect } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  catalogPage,
  categoryView,
  CATALOG_PAGE_SIZE,
} from "@server/catalog/application/service";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import {
  CategoryCards,
  EmptyState,
  Pagination,
  ProductRows,
  RankingExplanation,
  SiteShell,
} from "../components/catalog";
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
  SortMenu,
  StoreChecklist,
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
    return {
      kind: "food" as const,
      ...(await catalog.category(market, params.categorySlug, {
        page: catalogPage(url.searchParams.get("page")),
        unrankedPage: catalogPage(url.searchParams.get("unrankedPage")),
        view: categoryView(url.searchParams.get("view")),
        filters: checked.filters,
      })),
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
const SORTS = [
  { view: "top", label: "Closest match", hint: "The ranking" },
  { view: "trending", label: "Trending", hint: "Rising this week" },
  { view: "new", label: "Newest", hint: "Recently added" },
];

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
  const filtered = hasFilters(data.filters);
  useApplySavedFilters(data.market.code, {
    stores: data.storeOptions.map((store) => store.slug),
    freeFrom: [],
  });
  return (
    <SiteShell>
      <Breadcrumb
        items={[
          { label: "All foods", to: homePath(data.market.code) },
          { label: data.category.name },
        ]}
      />
      <header className="page-heading section-space-sm">
        <p className="eyebrow">{data.market.name} · Alternatives to</p>
        <h1>{data.category.name}</h1>
        <p>All the familiar flavor. A different way to get there.</p>
        <Link
          className="text-link"
          to={`/add-product?category=${data.category.id}&country=${data.market.code}`}
        >
          Know another alternative? Add a product →
        </Link>
      </header>
      {!!data.children.length && (
        <section className="section-space">
          <h2>Explore a category</h2>
          <CategoryCards categories={data.children} />
        </section>
      )}
      {!!data.category.isRankable && (
        <div className="va-filter-bar">
          <SortMenu options={SORTS} current={data.view} />
          <StoreChecklist
            country={data.market.code}
            stores={data.storeOptions}
            filters={data.filters}
          />
        </div>
      )}
      {!!data.category.isRankable && (
        <p className="va-filter-note section-space-sm">
          Your stores are saved on this device and apply to every ranking. A
          product shows if it’s commonly found at any of your stores. Stores
          listed are the ones members report in {data.market.name}.
        </p>
      )}
      {!!data.category.isRankable && data.view !== "top" && (
        <>
          <div className="ranking-heading">
            <h2>
              {data.view === "trending"
                ? "Trending alternatives"
                : "New alternatives"}
            </h2>
            <span>
              {data.view === "trending"
                ? "Unusual recent activity"
                : `Added in the last ${data.newDays} days`}
            </span>
          </div>
          <p className="small muted">
            {data.view === "trending"
              ? "Trending reflects recent ratings, tries and discussion compared with the week before. It never changes the Top ranking."
              : "Newly added products appear here before they have enough ratings to rank. Being new never raises a Top score."}
          </p>
          {data.discovery.length ? (
            <ProductRows
              products={data.discovery}
              categoryId={data.category.id}
              stores={data.storeOptions}
            />
          ) : (
            <EmptyState
              title={
                data.view === "trending"
                  ? "Nothing is trending right now."
                  : "No new alternatives recently."
              }
            >
              Check Top for the community’s long-term ranking.
            </EmptyState>
          )}
          <Pagination page={data.page} hasNext={data.hasNext} />
        </>
      )}
      {!!data.category.isRankable && data.view === "top" && (
        <>
          <div className="ranking-heading">
            <h2>
              Top alternatives <span>{data.category.productCount}</span>
            </h2>
            <span>Ranked by similarity</span>
          </div>
          <RankingExplanation />
          {filtered && !data.ranked.length && data.page === 1 ? (
            <EmptyState
              title="No ranked swaps match your filters yet"
              actions={
                <Link
                  className="button secondary"
                  to={foodPath(data.market.code, data.category.slug)}
                  onClick={() =>
                    saveFilters(data.market.code, { stores: [], freeFrom: [] })
                  }
                >
                  Clear filters
                </Link>
              }
            >
              A new product may still be waiting for its first rating. Check
              below, or loosen your filters.
            </EmptyState>
          ) : data.ranked.length ? (
            <ProductRows
              products={data.ranked}
              start={(data.page - 1) * CATALOG_PAGE_SIZE + 1}
              categoryId={data.category.id}
              stores={data.storeOptions}
            />
          ) : (
            <EmptyState
              title={
                data.page > 1
                  ? "You’ve reached the end."
                  : "A fresh start for this category."
              }
            >
              Be the first to share how close an alternative comes.
            </EmptyState>
          )}
          <Pagination page={data.page} hasNext={data.hasNext} />
          {(!!data.unranked.length || data.unrankedPage > 1) && (
            <section className="section-space">
              <div className="section-heading">
                <div>
                  <h2>Waiting for a first rating</h2>
                  <p>
                    These alternatives are unranked. Tried one? Share your
                    experience.
                  </p>
                </div>
              </div>
              <ProductRows
                products={data.unranked}
                categoryId={data.category.id}
                unranked
              />
              <Pagination
                page={data.unrankedPage}
                hasNext={data.hasNextUnranked}
                parameter="unrankedPage"
                label="Unranked products"
              />
            </section>
          )}
        </>
      )}
    </SiteShell>
  );
}
