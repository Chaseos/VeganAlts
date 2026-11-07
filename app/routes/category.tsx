import { ApplicationError } from "@server/shared/domain/errors";
import { env } from "cloudflare:workers";
import { batchSection } from "@server/catalog/domain/batches";
import { Link, redirect, useLocation } from "react-router";
import { publicCatalogService } from "@server/catalog/infrastructure/composition";
import {
  catalogPage,
  categoryView,
  CATALOG_PAGE_SIZE,
  UnknownViewError,
} from "@server/catalog/application/service";
import {
  publicLoader,
  requireCatalogPreview,
  pageLanguage,
} from "@server/catalog/http/loader";
import { EmptyState } from "../components/ui/feedback";
import { useCallback, useMemo } from "react";
import {
  BatchItems,
  SeeMore,
  useBatches,
} from "../components/catalog/see-more";
import { ButtonLink } from "../components/ui/button";
import { Badge, CheckThePackage, SeasonalBadge } from "../components/ui/badges";
import { seasonOf } from "@server/taxonomy/domain/season";
import { FoodIcon } from "../components/icons/food-icons";
import {
  FeaturedSwap,
  RankedRow,
  UnratedRow,
  sortNote,
} from "../components/catalog/ranking-list";
import { categorySummary } from "../lib/summaries";
import { counted } from "../lib/counted";
import { t } from "../i18n";
import { formatScore, inSentence, joinList, productName } from "../lib/format";
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
  const catalog = publicCatalogService(env, pageLanguage(request));
  const country = parseCountryCode(params.country);
  // Read alongside the redirect check; a moved slug's failure is never seen.
  const place = catalog.market(country).then(async (market) => ({
    market,
    summary: await catalog.summary(market, params.categorySlug),
  }));
  place.catch(() => {});
  // A renamed or merged category redirects (uncached) to its current slug.
  const moved = await catalog.categoryRedirect(params.categorySlug);
  if (moved)
    throw redirect(
      `${foodPath(country, moved)}${new URL(request.url).search}`,
      {
        status: 302,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  return publicLoader(async () => {
    const continuation = new URL(request.url).searchParams;
    if (continuation.has("cursor") && !continuation.has("section"))
      throw new ApplicationError(
        "INVALID_CURSOR",
        "Choose a results section before continuing.",
      );
    const url = new URL(request.url);
    const { market, summary } = await place;
    // Aisles are groups with their own page; a deeper group (a retired shelf
    // from the three-level shape) opens its aisle, and Food itself is the
    // home page. The public boundary drops the old `?shelf=` parameter.
    if (!summary.isRankable) {
      const aisle = await catalog.aisle(market, params.categorySlug);
      if (aisle.kind === "root") throw redirect(homePath(country));
      if (aisle.kind === "group")
        throw redirect(foodPath(country, aisle.aisleSlug), {
          status: 302,
          headers: { "Cache-Control": "private, no-store" },
        });
      return {
        ...aisle,
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
        section: batchSection(url.searchParams.get("section"), [
          "ranked",
          "unranked",
        ] as const),
        cursor: url.searchParams.get("cursor"),
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
          params.delete("section");
          params.delete("cursor");
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
        (code, language) => foodPath(code, slug, language),
      )
    : [];
  // A food that is not on here invites the first product but isn't indexed,
  // and neither is a new food with nothing to show yet.
  const thin =
    loaderData?.kind === "food" &&
    (!loaderData.availability.here ||
      ((loaderData.category.provisionalUntil ?? 0) > Date.now() &&
        loaderData.category.productCount === 0));
  const hidden =
    thin && !loaderData.staging ? [{ name: "robots", content: "noindex" }] : [];
  return [...pageMeta(loaderData), ...alternates, ...hidden];
}
function pageMeta(loaderData: Route.MetaArgs["loaderData"]) {
  if (loaderData?.kind === "aisle")
    return publicMetadata(
      t("category.aisleMetaTitle", { aisle: loaderData.aisle.name }),
      t("category.aisleMetaDescription", {
        aisle: inSentence(loaderData.aisle.name),
      }),
      foodPath(loaderData.market.code, loaderData.aisle.slug),
      loaderData.origin,
      loaderData.staging,
    );
  const data = loaderData?.kind === "food" ? loaderData : undefined;
  const origin = data?.origin ?? "https://veganalts.com";
  const structured = data
    ? [
        breadcrumbs(origin, [
          { name: t("category.home"), path: "/" },
          {
            name: data.category.name,
            path: foodPath(data.market.code, data.category.slug),
          },
        ]),
        ...(data.view === "top" && data.ranked.length
          ? [
              itemList(
                origin,
                t("category.topAlternatives", { food: data.category.name }),
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
        ? t("category.metaTitle", { food: inSentence(data.category.name) })
        : t("category.fallbackFood"),
      t("category.metaDescription", {
        food: inSentence(data?.category.name ?? t("category.fallbackFood")),
      }),
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
          { label: t("nav.allFoods"), to: homePath(data.market.code) },
          { label: data.aisle.name },
        ]}
      />
      <AislePanel country={data.market.code} data={data} />
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
              { label: t("nav.allFoods"), to: homePath(code) },
              { label: food },
            ]}
          />
          <h1 className="va-ranking__title">
            {t("category.title", { food: inSentence(food) })}
          </h1>
        </header>
        <EmptyState
          title={t("category.notHere", { country: data.market.name })}
          actions={
            <>
              <ButtonLink
                to={`/add-product?country=${code}&food=${data.category.slug}`}
              >
                {t("menu.addProduct")}
              </ButtonLink>
              {elsewhere && (
                <Link
                  className="button secondary"
                  to={foodPath(elsewhere, data.category.slug)}
                >
                  {t("category.seeIn", {
                    country: names.get(elsewhere) ?? elsewhere.toUpperCase(),
                  })}
                </Link>
              )}
            </>
          }
        >
          {t("category.notHereBody", {
            food: inSentence(food),
            country: data.market.name,
          })}
        </EmptyState>
      </div>
    </PageShell>
  );
}

function FoodRanking({ data }: { data: FoodData }) {
  const location = useLocation();
  if (!data.availability.here) return <NotHereYet data={data} />;
  return (
    <FoodRankingList
      key={location.pathname + location.search}
      data={data}
      context={location.pathname + location.search}
    />
  );
}

function FoodRankingList({
  data,
  context,
}: {
  data: FoodData;
  context: string;
}) {
  const code = data.market.code;
  const food = data.category.name;
  const season = seasonOf(data.category.seasonStart, data.category.seasonEnd);
  const filtered = hasFilters(data.filters);
  const labels = useMemo(
    () =>
      Object.fromEntries(
        data.allergenOptions.map((option) => [option.key, option.label]),
      ),
    [data.allergenOptions],
  );
  const params = new URLSearchParams(context.split("?")[1]);
  params.delete("page");
  params.delete("unrankedPage");
  params.delete("section");
  params.delete("cursor");
  params.set("country", code);
  const endpoint = `/api/v1/categories/${data.category.slug}?${params}`;
  const initialMetadata = {
    summary: data.summary,
    shownCount: data.shownCount,
    notConfirmedCount: data.notConfirmedCount,
  };
  const ranked = useBatches({
    context,
    section: "ranked",
    initial: data.batches.ranked,
    initialMetadata,
    endpoint,
    identity: (line) => line.lineId,
  });
  const unrated = useBatches({
    context,
    section: "unranked",
    initial: data.batches.unranked,
    endpoint,
    identity: (line) => line.lineId,
  });
  const { summary, shownCount, notConfirmedCount } =
    ranked.metadata ?? initialMetadata;
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
      label: t("category.ranking"),
      hint: tastiestView ? t("brand.tastiest") : t("category.closestOriginal"),
    },
    {
      view: "trending",
      label: t("category.sortTrending"),
      hint: t("category.sortTrendingHint"),
    },
    {
      view: "new",
      label: t("category.sortNew"),
      hint: t("category.sortNewHint"),
    },
    ...data.questions.map((question) => ({
      view: `detail-${question.key}`,
      label: t("category.sortDetail", { detail: inSentence(question.label) }),
      hint: t("category.sortDetailHint"),
    })),
    {
      view: "most-rated",
      label: t("category.sortMost"),
      hint: t("category.sortMostHint"),
    },
  ];
  const activeDetail = data.view.startsWith("detail-")
    ? data.view.slice(7)
    : null;
  const question = data.questions.find((q) => q.key === activeDetail);
  const rankOf = (line: (typeof data.ranked)[number]) =>
    tastiestView ? line.tastiestRank : line.closestRank;
  // A restored list keeps its original featured card and ranking snapshot.
  const firstBatch = ranked.batches[0]!;
  const first = firstBatch.items[0];
  const featured =
    ranking && firstBatch.start === 0 && first && rankOf(first) !== null
      ? first
      : undefined;

  const freeLabel = data.filters.freeFrom
    .map((key) => t("filters.free", { name: inSentence(labels[key] ?? key) }))
    .join(t("list.separator"));
  const flag =
    featured && rankOf(featured) === 1
      ? tastiestView
        ? t("category.flagTastiest")
        : t("category.flagTop")
      : freeLabel
        ? t("category.flagFiltered", {
            base: tastiestView
              ? t("brand.tastiest")
              : t("category.closestMatch"),
            filters: freeLabel,
          })
        : tastiestView
          ? t("brand.tastiest")
          : t("category.closestMatch");
  const renderRanked = useCallback(
    (line: (typeof data.ranked)[number], batch: typeof data.batches.ranked) => (
      <li
        key={line.lineId}
        className="va-result"
        data-result={line.lineId}
        tabIndex={-1}
      >
        {line.lineId === batch.boundaryId && question && (
          <p className="va-rank-list__divider">
            {t("category.fewAnswers", { detail: inSentence(question.label) })}
          </p>
        )}
        {line.lineId === batch.boundaryId && tastiestView && (
          <p className="va-rank-list__divider">{t("category.noTastyYet")}</p>
        )}
        {line.lineId === featured?.lineId ? (
          <FeaturedSwap
            country={code}
            food={data.category.slug}
            line={line}
            rank={tastiestView ? line.tastiestRank : line.closestRank}
            flag={flag}
            labels={labels}
            stores={data.storeOptions}
          />
        ) : (
          <RankedRow
            country={code}
            food={data.category.slug}
            line={line}
            rank={tastiestView ? line.tastiestRank : line.closestRank}
            note={sortNote(data.view, line)}
            activeDetail={activeDetail}
            labels={labels}
            stores={data.storeOptions}
          />
        )}
      </li>
    ),
    [
      code,
      data.category.slug,
      data.storeOptions,
      data.view,
      featured?.lineId,
      flag,
      labels,
      question,
      tastiestView,
      activeDetail,
    ],
  );
  const renderUnrated = useCallback(
    (line: (typeof data.unranked)[number]) => (
      <UnratedRow
        key={line.lineId}
        country={code}
        food={data.category.slug}
        line={line}
        labels={labels}
      />
    ),
    [code, data.category.slug, labels],
  );
  const clearHref = foodPath(code, data.category.slug);
  const aislePath = data.place.aisle
    ? foodPath(code, data.place.aisle.slug)
    : homePath(code);
  return (
    <PageShell
      width="wide"
      phoneBack={{
        to: aislePath,
        label: data.place.aisle?.name ?? t("nav.allFoods"),
        context: data.place.aisle?.name ?? "",
      }}
      phoneTitle={
        <p className="va-ranking__phone-title" aria-hidden="true">
          {t("category.title", { food: inSentence(food) })}
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
                { label: t("nav.allFoods"), to: homePath(code) },
                ...(data.place.aisle
                  ? [
                      {
                        // Distinguish the category from its food of the same name.
                        label:
                          data.place.aisle.name === food
                            ? t("category.categoryName", { name: food })
                            : data.place.aisle.name,
                        to: aislePath,
                      },
                    ]
                  : []),
                { label: food },
              ]}
            />
            <h1 className="va-ranking__title">
              {t("category.title", { food: inSentence(food) })}
            </h1>
            {(data.category.provisionalUntil ?? 0) > Date.now() && (
              <p className="va-ranking__season">
                <Badge tone="new">{t("badge.new")}</Badge>
              </p>
            )}
            {season && (
              <p className="va-ranking__season">
                <SeasonalBadge />
              </p>
            )}
            <p className="va-ranking__summary">
              {categorySummary({
                food,
                // Tastiest counts only lines and people with its answers.
                rankedCount: tastiestView
                  ? summary.tastiestCount
                  : summary.rankedCount,
                people: tastiestView
                  ? summary.tastiestPeople
                  : summary.ratingCount,
                best: summary.best,
                tastiest: tastiestView,
              })}
            </p>
            <details className="va-ranking__how">
              <summary>{t("category.howTitle")}</summary>
              <p>
                {t("category.how1", { food: inSentence(food) })}
                {data.questions.length > 0 &&
                  ` ${t("category.howDetails", {
                    list: joinList(
                      data.questions.map((q) => inSentence(q.label)),
                    ).replace(/^./, (c) => c.toUpperCase()),
                  })}`}{" "}
                {t("category.how3")}
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
              shown={shownCount}
              total={summary.rankedCount}
              filtered={filtered}
            />
          </div>
          {data.filters.freeFrom.length > 0 && (
            <CheckThePackage>
              {t("category.allergenSource")}
              {notConfirmedCount > 0 && (
                <>
                  {" "}
                  {counted("category.hidden", notConfirmedCount)}{" "}
                  <Link
                    className="va-link"
                    to={filteredHref(
                      clearHref,
                      data.view === "top" ? "" : `?view=${data.view}`,
                      { ...data.filters, freeFrom: [] },
                    )}
                  >
                    {t("category.showHidden", { count: notConfirmedCount })}
                  </Link>
                </>
              )}
            </CheckThePackage>
          )}

          {data.view === "trending" && (
            <p className="va-small va-muted">{t("category.trendingNote")}</p>
          )}
          {data.view === "new" && (
            <p className="va-small va-muted">
              {t("category.newNote", { days: data.newDays })}
            </p>
          )}

          {!ranked.count && firstBatch.start === 0 ? (
            filtered ? (
              <EmptyState
                title={t("category.noMatchFilters")}
                actions={
                  <Link
                    className="button secondary"
                    to={clearHref}
                    onClick={() =>
                      saveFilters(code, { stores: [], freeFrom: [] })
                    }
                  >
                    {t("category.clearFilters")}
                  </Link>
                }
              >
                {t("category.newWaiting")}
              </EmptyState>
            ) : (
              <EmptyState
                title={
                  data.view === "trending"
                    ? t("category.nothingTrending")
                    : data.view === "new"
                      ? t("category.noNew")
                      : t("category.noneRanked", { food: inSentence(food) })
                }
                actions={
                  <ButtonLink
                    to={`/add-product?country=${code}&food=${data.category.slug}`}
                  >
                    {t("menu.addProduct")}
                  </ButtonLink>
                }
              >
                {data.view === "top"
                  ? t("category.rateBelow")
                  : t("category.longTerm")}
              </EmptyState>
            )
          ) : (
            <ol
              ref={ranked.list}
              className="va-rank-list"
              start={firstBatch.start + 1}
            >
              {ranked.batches.map((batch, index) => (
                <BatchItems key={index} batch={batch} render={renderRanked} />
              ))}
            </ol>
          )}
          <SeeMore {...ranked.control} />

          {(unrated.count > 0 || data.unrankedPage > 1) && (
            <section
              className="va-ranking__unrated"
              aria-labelledby="unrated-title"
            >
              <h2 id="unrated-title" className="va-heading-s">
                {t("brand.notRated")}
              </h2>
              <p className="va-muted">{t("category.unratedNote")}</p>
              <ul ref={unrated.list} className="va-unrated-list">
                {unrated.batches.map((batch, index) => (
                  <BatchItems
                    key={index}
                    batch={batch}
                    render={renderUnrated}
                  />
                ))}
              </ul>
              <SeeMore {...unrated.control} />
            </section>
          )}
          <p className="va-ranking__add">
            {t("category.knowSwap", {
              food: inSentence(food),
            })}{" "}
            <Link
              className="va-link"
              to={`/add-product?country=${code}&food=${data.category.slug}`}
            >
              {t("menu.addProduct")}
            </Link>
            {t("text.stop")}
            {t("category.replacing")}{" "}
            <Link className="va-link" to={`/propose-category?country=${code}`}>
              {t("nav.suggestFood")}
            </Link>
            . {t("category.wrong")}{" "}
            <Link
              className="va-link"
              to={`/report-food?country=${code}&food=${data.category.slug}`}
              rel="nofollow"
            >
              {t("category.report")}
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
    params.delete("section");
    params.delete("cursor");
    if (view === "top") params.delete("view");
    else params.set("view", view);
    params.sort();
    return `${location.pathname}${params.size ? `?${params}` : ""}`;
  };
  return (
    <TabLinks
      label={t("category.ranking")}
      tabs={[
        {
          to: href("top"),
          label: t("category.closestOriginal"),
          current: current === "top",
        },
        {
          to: href("tastiest"),
          label: t("brand.tastiest"),
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
    <nav
      className="va-food-side"
      aria-label={t("category.categoryName", { name: aisle.name })}
    >
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
          <p className="va-overline">{t("category.other")}</p>
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
