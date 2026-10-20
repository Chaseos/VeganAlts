import { ApplicationError } from "../../shared/domain/errors";
import type {
  CatalogRepository,
  CategoryView,
  DiscoveryRow,
  FlavorRow,
  ProductSummary,
  TopProduct,
} from "../domain/contracts";
import { startWithThese, stillWaiting, type FoodLeader } from "../domain/home";
import {
  detailBadges,
  detailKey,
  detailScores,
  orderRows,
  parseCategoryView,
} from "../domain/ranking-view";
import { DEFAULT_TRENDING } from "../../ranking/domain/trending";
import { flavorLabel } from "../domain/flavor-label";
import {
  aisleFood,
  aisleTree,
  byPopularity,
  taxonomyShape,
} from "../../taxonomy/domain/shape";
import { seasonOf } from "../../taxonomy/domain/season";
import { silentAisle } from "../../taxonomy/domain/display";
import { foodChoices } from "../../taxonomy/domain/food-choices";
import {
  AISLE_TOP,
  DETAIL_MIN_ANSWERS,
  FLAVOR_SCORE_MIN_ANSWERS,
  HOME_LIST_SIZE,
  SUGGEST_BRANDS,
  SUGGEST_LIMIT,
  isEarly,
} from "../../ranking/domain/display";
import { distribution, recentEaters } from "../domain/product-view";
import {
  intersectFilters,
  NO_FILTERS,
  type RankingFilters,
} from "../domain/filters";
import {
  parseCountryCode,
  type Market,
  type MarketSummary,
} from "../domain/markets";

export const CATALOG_PAGE_SIZE = 20;

export function searchExpression(input: string) {
  const query = input.normalize("NFKC").trim().slice(0, 80);
  const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  // Only quoted literal tokens enter MATCH. FTS operators and punctuation are data.
  return {
    query,
    expression: tokens.map((token) => `"${token}"*`).join(" AND "),
  };
}

export function categoryView(input: string | null): CategoryView {
  const view = parseCategoryView(input);
  if (!view)
    throw new ApplicationError(
      "INVALID_VIEW",
      "Choose Closest match, Tastiest, Trending, Newest, Most rated or a detail sort.",
    );
  return view;
}
// A detail sort for a question the food does not ask (any more). Pages
// redirect to Closest match.
export class UnknownViewError extends ApplicationError {
  constructor() {
    super("UNKNOWN_VIEW", "This food has no such sort.", 404);
  }
}
export function catalogPage(input: string | null) {
  if (input === null) return 1;
  if (!/^[1-9]\d{0,2}$/.test(input) || Number(input) > 100)
    throw new ApplicationError("INVALID_PAGE", "Choose a page from 1 to 100.");
  return Number(input);
}

export const NEW_PRODUCT_DAYS = 30;
export function isNewProduct(
  publishedAt: number | null | undefined,
  now: number,
) {
  return (
    typeof publishedAt === "number" &&
    publishedAt <= now &&
    now - publishedAt < NEW_PRODUCT_DAYS * 86_400_000
  );
}

export interface CategoryQuery {
  page?: number;
  unrankedPage?: number;
  view?: CategoryView;
  filters?: RankingFilters;
}

export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly clock = Date.now,
    private readonly newDays = DEFAULT_TRENDING.newDays,
    private readonly taggedLines = DEFAULT_TRENDING.taggedLines,
  ) {}

  // The top trending lines in a food carry a Trending tag in other views.
  private isTrendingRank(rank: number | null) {
    return rank !== null && rank <= this.taggedLines;
  }
  private readonly leaderProduct = (product: TopProduct) => ({
    ...leaderProduct(product),
    trending: this.isTrendingRank(product.trendingRank),
  });

  private labelNew<T extends Pick<ProductSummary, "publishedAt">>(
    products: T[],
  ) {
    const now = this.clock();
    return products.map((product) => ({
      ...product,
      isNew: isNewProduct(product.publishedAt, now),
    }));
  }

  private newSince() {
    return this.clock() - this.newDays * 86_400_000;
  }

  async markets() {
    return (await this.repository.markets()).map((row) => ({
      market: {
        id: row.id,
        code: row.iso2.toLowerCase(),
        iso2: row.iso2,
        name: row.name,
      } satisfies Market,
      hasRankings: !!row.hasRankings,
    }));
  }

  // Only active countries resolve; anything else is a 404.
  async market(code: string): Promise<Market> {
    const wanted = parseCountryCode(code);
    const found = (await this.markets()).find(
      (row) => row.market.code === wanted,
    );
    if (!found)
      throw new ApplicationError(
        "NOT_FOUND",
        "This country is not available.",
        404,
      );
    return found.market;
  }

  // Header, menu and footer data for every page in a country.
  async page(code: string) {
    const wanted = parseCountryCode(code);
    const markets = await this.markets();
    const found = markets.find((row) => row.market.code === wanted);
    if (!found)
      throw new ApplicationError(
        "NOT_FOUND",
        "This country is not available.",
        404,
      );
    const taxonomy = await this.repository.taxonomy(found.market.id);
    // Rating counts included: the header and footer use popularity order.
    const counts = new Map(taxonomy.counts.map((row) => [row.categoryId, row]));
    return {
      market: found.market,
      countries: markets.map((row): MarketSummary => ({
        code: row.market.code,
        name: row.market.name,
        hasRankings: row.hasRankings,
      })),
      hasRankings: found.hasRankings,
      aisles: aisleTree(taxonomy.categories, counts),
    };
  }

  // Drops stores and allergens the country does not offer. Callers redirect
  // to the URL without them, so unknown values never become cache variants.
  async validateFilters(market: Market, filters: RankingFilters) {
    const options = await this.repository.filterOptions(market.id);
    const valid = intersectFilters(filters, {
      stores: options.stores.map((option) => option.key),
      freeFrom: options.allergens.map((option) => option.key),
    });
    return {
      filters: valid,
      changed:
        valid.stores.length !== filters.stores.length ||
        valid.freeFrom.length !== filters.freeFrom.length,
      options,
    };
  }

  // Every aisle, including aisles without foods yet, for choosing where a
  // suggested food belongs, in the site's popularity order.
  async aisles(market: Market) {
    const taxonomy = await this.repository.taxonomy(market.id);
    const counts = new Map(taxonomy.counts.map((row) => [row.categoryId, row]));
    return aisleTree(taxonomy.categories, counts, { withEmpty: true }).map(
      (aisle) => ({ id: aisle.id, slug: aisle.slug, name: aisle.name }),
    );
  }

  /**
   * What Add a product needs to pick a food in a country: every placeable
   * food (marked when it is not on there yet), every aisle for suggesting a
   * new food, and the country's stores and allergen list.
   */
  async contributionChoices(market: Market) {
    const [taxonomy, aliases, aisles, options] = await Promise.all([
      this.repository.taxonomy(market.id),
      this.repository.foodAliases(market.id),
      this.aisles(market),
      this.repository.filterOptions(market.id),
    ]);
    return {
      foods: foodChoices(taxonomy.categories, aliases),
      aisles,
      allergens: options.allergens,
    };
  }

  // A category's identity and whether it is a food, without its listings.
  async summary(market: Market, slug: string) {
    const category = await this.repository.category(market.id, slug);
    if (!category)
      throw new ApplicationError("NOT_FOUND", "Category not found.", 404);
    return category;
  }

  // A group category's place: Food itself, an aisle (its own page) or a
  // deeper group, such as a retired shelf from the three-level shape (its
  // aisle).
  async aisle(market: Market, slug: string) {
    const [taxonomy, productCount] = await Promise.all([
      this.repository.taxonomy(market.id),
      this.repository.productCount(market.id),
    ]);
    // Like its home, a country without products shows the shared foods.
    const shared = !productCount;
    const shape = taxonomyShape(taxonomy.categories);
    const node = [...shape.values()].find((item) => item.slug === slug);
    if (!node || node.isRankable)
      throw new ApplicationError("NOT_FOUND", "Aisle not found.", 404);
    if (node.depth === 0) return { kind: "root" as const };
    const aisle = shape.get(node.aisleId!)!;
    if (node.depth !== 1)
      return { kind: "group" as const, aisleSlug: aisle.slug };
    const counts = new Map(taxonomy.counts.map((row) => [row.categoryId, row]));
    // Only foods that are on in this country, most popular first.
    const foods = [...shape.values()]
      .filter(
        (item) =>
          item.parentId === aisle.id &&
          item.isRankable &&
          !item.outsideDepth &&
          (shared || item.available !== 0),
      )
      .map((item) => aisleFood(item, counts))
      .sort(byPopularity);
    const top = await this.repository.topProducts(
      market.id,
      foods.map((food) => food.id),
      AISLE_TOP,
    );
    return {
      kind: "aisle" as const,
      aisle: {
        slug: aisle.slug,
        name: aisle.name,
        silent: silentAisle(aisle, foods),
      },
      foods: foods.map((food) => ({
        slug: food.slug,
        name: food.name,
        productCount: food.productCount,
        rankedCount: food.rankedCount,
        season: food.season,
        top: top
          .filter((product) => product.categoryId === food.id)
          .map((product) => ({
            slug: product.slug,
            name: product.name,
            brand: product.brand,
            imageId: product.imageId,
            score: product.bayesianScore,
            ratingCount: product.ratingCount,
            rank: product.rank,
            early: isEarly(product.ratingCount),
          })),
      })),
    };
  }

  async home(market: Market) {
    const [taxonomy, featured, trending, newest, productCount] =
      await Promise.all([
        this.repository.taxonomy(market.id),
        this.repository.featuredCategories(market.id),
        this.repository.homeTrending(market.id, HOME_LIST_SIZE),
        this.repository.homeNewest(market.id, this.newSince(), 4),
        this.repository.productCount(market.id),
      ]);
    const counts = new Map(taxonomy.counts.map((row) => [row.categoryId, row]));
    // A country without products lists the shared aisles, so people can add
    // the first products there, even if some foods are already switched on.
    const aisles = productCount
      ? aisleTree(taxonomy.categories, counts)
      : aisleTree(
          taxonomy.categories.map((node) => ({ ...node, available: 1 })),
          counts,
        );
    const foods = aisles.flatMap((aisle) => aisle.foods);
    const leaders = await this.repository.topProducts(
      market.id,
      foods.map((food) => food.id),
      1,
    );
    const foodLeaders: FoodLeader[] = foods.map((food) => ({
      food: { id: food.id, slug: food.slug, name: food.name },
      best: leaders.find((top) => top.categoryId === food.id) ?? null,
    }));
    const best = (id: string) =>
      foodLeaders.find((leader) => leader.food.id === id)?.best ?? null;
    const summary = (leader: FoodLeader) => ({
      food: { slug: leader.food.slug, name: leader.food.name },
      best: leader.best && this.leaderProduct(leader.best),
    });
    // Homepage features, in order, name the "Try" chips.
    const tryFoods = featured
      .filter((category) => category.isRankable)
      .map((category) => ({ slug: category.slug, name: category.name }));
    return {
      counts: { foods: foods.length, products: productCount },
      tryFoods,
      startWithThese: startWithThese(
        foodLeaders,
        featured.map((category) => category.id),
      ).map(summary),
      aisles: aisles.map((aisle) => ({
        slug: aisle.slug,
        name: aisle.name,
        foodCount: aisle.foods.length,
        foods: aisle.foods.map((food) => {
          const top = best(food.id);
          return {
            slug: food.slug,
            name: food.name,
            best: top && this.leaderProduct(top),
            productCount: food.productCount,
            season: food.season,
          };
        }),
      })),
      trending: this.labelNew(trending),
      newest: this.labelNew(newest),
      stillWaiting: stillWaiting(foodLeaders).map(summary),
      newDays: this.newDays,
      featured,
    };
  }
  /**
   * Instant answers while typing: up to five foods with their top three and
   * up to five products with where they rank. Short queries return nothing.
   */
  suggest(market: Market, input: string) {
    return this.answers(
      market,
      input,
      SUGGEST_LIMIT,
      SUGGEST_LIMIT,
      SUGGEST_BRANDS,
    );
  }
  /** The full search page: the same answers with room for more. */
  searchResults(market: Market, input: string) {
    return this.answers(market, input, 12, 20, 10);
  }
  private async answers(
    market: Market,
    input: string,
    foodLimit: number,
    productLimit: number,
    brandLimit: number,
  ) {
    const { query, expression } = searchExpression(input);
    const letters = query.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    // Instant answers start at three letters or digits (docs/API.md).
    if (!expression || letters < 3)
      return { query, foods: [], products: [], brands: [] };
    const [results, taxonomy, brands] = await Promise.all([
      this.repository.search(market.id, market.iso2, expression),
      this.repository.taxonomy(market.id),
      this.repository.brands(market.id, query, brandLimit),
    ]);
    const shape = taxonomyShape(taxonomy.categories);
    const counts = new Map(taxonomy.counts.map((row) => [row.categoryId, row]));
    const foods = results.categories
      .filter((category) => category.isRankable)
      .slice(0, foodLimit);
    const products = results.products.slice(0, productLimit);
    const [top, placement] = await Promise.all([
      this.repository.topProducts(
        market.id,
        foods.map((food) => food.id),
        AISLE_TOP,
      ),
      this.repository.productPlacement(
        market.id,
        products.map((product) => product.id),
      ),
    ]);
    return {
      query,
      // Brands by the shared matcher, with their product counts here.
      brands: brands.map((brand) => ({
        slug: brand.slug,
        name: brand.name,
        productCount: brand.productCount,
      })),
      foods: foods.map((food) => {
        const node = shape.get(food.id);
        const aisle = node?.aisleId ? shape.get(node.aisleId) : undefined;
        const ranked = top.filter((product) => product.categoryId === food.id);
        return {
          slug: food.slug,
          name: food.name,
          // An aisle that only repeats the food's name (Eggs) is left out.
          aisle:
            aisle && aisle.id !== food.id && aisle.name !== food.name
              ? aisle.name
              : null,
          productCount: counts.get(food.id)?.productCount ?? 0,
          rankedCount: counts.get(food.id)?.rankedCount ?? 0,
          season: seasonOf(food.seasonStart, food.seasonEnd),
          top: ranked.map(this.leaderProduct),
        };
      }),
      products: products.flatMap((product) => {
        const place = placement.find((row) => row.productId === product.id);
        return place
          ? [
              {
                slug: product.slug,
                name: product.name,
                brand: product.brand,
                imageId: product.imageId,
                food: { slug: place.foodSlug, name: place.foodName },
                rank: place.rank,
                score: place.bayesianScore,
                early: place.rank !== null && isEarly(place.ratingCount),
              },
            ]
          : [];
      }),
    };
  }
  /**
   * A brand in a country: its product count and its lines grouped by aisle
   * and food, each with its Closest and Tastiest ranks there and its
   * flavors. Add a product's "Already listed from [brand]" uses it too.
   */
  async brand(market: Market, slug: string) {
    const brand = await this.repository.brand(market.id, slug);
    if (!brand)
      throw new ApplicationError("NOT_FOUND", "Brand not found.", 404);
    const [lines, taxonomy] = await Promise.all([
      this.repository.brandLines(market.id, brand.id),
      this.repository.taxonomy(market.id),
    ]);
    const counts = new Map(taxonomy.counts.map((row) => [row.categoryId, row]));
    const aisles = aisleTree(taxonomy.categories, counts)
      .map((aisle) => ({
        slug: aisle.slug,
        name: aisle.name,
        foods: aisle.foods
          .map((food) => ({
            slug: food.slug,
            name: food.name,
            lines: lines
              .filter((line) => line.categoryId === food.id)
              .map(({ categoryId: _, ...line }) => ({
                ...line,
                early: line.closestRank !== null && isEarly(line.people),
              })),
          }))
          .filter((food) => food.lines.length),
      }))
      .filter((aisle) => aisle.foods.length);
    return {
      brand: { slug: brand.slug, name: brand.name },
      productCount: brand.productCount,
      // A brand with nothing listed here still has a page (noindex).
      availability: { here: brand.productCount > 0 },
      aisles,
    };
  }
  async sitemap() {
    const [entries, markets] = await Promise.all([
      this.repository.sitemap(),
      this.markets(),
    ]);
    return { ...entries, countries: markets.map((row) => row.market.code) };
  }
  // A renamed or merged category's former slug. Callers redirect uncached.
  categoryRedirect(slug: string) {
    return this.repository.categoryRedirect(slug);
  }

  async category(
    market: Market,
    slug: string,
    {
      page = 1,
      unrankedPage = 1,
      view = "top",
      filters = NO_FILTERS,
    }: CategoryQuery = {},
  ) {
    const category = await this.repository.category(market.id, slug);
    if (!category)
      throw new ApplicationError("NOT_FOUND", "Category not found.", 404);
    // A food that is not on in this country keeps its page, which invites
    // the first product there instead of listing anything.
    const here = !category.isRankable || category.available === 1;
    const [questions, set, storeOptions, unranked, taxonomy, availableIn] =
      await Promise.all([
        this.repository.questions(category.id),
        here ? this.repository.rankedSet(market.id, category.id, filters) : [],
        here
          ? this.repository.storeOptions(
              market.id,
              category.id,
              filters.freeFrom,
              view === "tastiest" ? "tastiest" : "closest",
            )
          : [],
        here
          ? this.repository.unranked(
              market.id,
              category.id,
              filters,
              (unrankedPage - 1) * CATALOG_PAGE_SIZE,
              CATALOG_PAGE_SIZE + 1,
              // Newest already lists unrated products from the New window.
              view === "new" ? this.newSince() : undefined,
              view === "tastiest" ? "tastiest" : "closest",
            )
          : [],
        this.repository.taxonomy(market.id),
        category.isRankable
          ? this.repository.foodCountries(category.id)
          : ([] as string[]),
      ]);
    const key = detailKey(view);
    if (key && !questions.some((question) => question.key === key))
      throw new UnknownViewError();
    const tastiestView = view === "tastiest";
    const all = set.map((row) => ({
      ...row,
      details: detailScores(row.details, questions),
    }));
    // Tastiest ranks only lines with Tastiest answers, in its own order.
    const tastiestOrder = orderRows(all, "tastiest");
    const tastiestRank = new Map(
      tastiestOrder.rows
        .slice(0, tastiestOrder.qualified)
        .map((row, index) => [row.id, index + 1]),
    );
    // Badges come from the unfiltered rankings so filters never move them.
    const closest = all.filter((row) => row.topRank !== null);
    const badges = detailBadges(closest, questions);
    const tastiest = tastiestOrder.qualified ? tastiestOrder.rows[0]! : null;
    // The Tastiest #1 is marked in the other views when it isn't Closest #1.
    if (!tastiestView && tastiest && tastiest.topRank !== 1)
      badges.set(tastiest.id, ["Tastiest", ...(badges.get(tastiest.id) ?? [])]);
    const byId = new Map(all.map((row) => [row.id, row]));
    // A line row in its documented shape (docs/API.md, milestone 7): score,
    // people and early describe the ranking being viewed.
    const listing = (row: (typeof all)[number] | DiscoveryRow) => {
      const ranked = byId.get(row.id);
      return {
        lineId: row.lineId,
        name: row.name,
        brand: row.brand,
        leadProduct: {
          id: row.id,
          slug: row.slug,
          versionId: row.versionId,
          imageId: row.imageId,
        },
        developmentOnly: row.developmentOnly,
        publishedAt: row.publishedAt ?? null,
        flavorCount: row.flavorCount,
        closestRank: ranked?.topRank ?? null,
        tastiestRank: tastiestRank.get(row.id) ?? null,
        score: tastiestView
          ? (ranked?.tastiestScore ?? null)
          : (ranked?.bayesianScore ?? null),
        people: tastiestView
          ? (ranked?.tastiestCount ?? 0)
          : (ranked?.ratingCount ?? row.ratingCount),
        // Early is counted separately for each ranking.
        early: ranked
          ? isEarly(tastiestView ? ranked.tastiestCount : ranked.ratingCount)
          : false,
        recentPeople: row.recentRatingCount,
        // The Trending view needs no tag of its own.
        trending:
          view !== "trending" &&
          this.isTrendingRank(ranked?.trendingRank ?? null),
        matchedStores: row.matchedStores,
        // A line of several flavors shows allergens per flavor.
        allergens: row.flavorCount > 1 ? null : row.allergens,
        details: ranked?.details ?? [],
        badges: badges.get(row.id) ?? [],
      };
    };
    const shown = all.filter(
      (row) =>
        (tastiestView || row.topRank !== null) &&
        row.storeMatch &&
        row.allergenMatch,
    );
    let listed: ReturnType<typeof listing>[];
    let hasNext: boolean;
    // The position on this page where lines without enough answers for a
    // detail sort, or without Tastiest answers, begin (they follow in
    // Closest order).
    let qualified: number | null = null;
    if (!here) {
      listed = [];
      hasNext = false;
    } else if (view === "trending" || view === "new") {
      // Trending and Newest are discovery views; they never reorder Top.
      const rows =
        view === "trending"
          ? await this.repository.trending(
              market.id,
              category.id,
              filters,
              (page - 1) * CATALOG_PAGE_SIZE,
              CATALOG_PAGE_SIZE + 1,
            )
          : await this.repository.newest(
              market.id,
              category.id,
              this.newSince(),
              filters,
              (page - 1) * CATALOG_PAGE_SIZE,
              CATALOG_PAGE_SIZE + 1,
            );
      listed = rows.slice(0, CATALOG_PAGE_SIZE).map(listing);
      hasNext = rows.length > CATALOG_PAGE_SIZE;
    } else {
      const ordered = orderRows(shown, view);
      const offset = (page - 1) * CATALOG_PAGE_SIZE;
      listed = ordered.rows
        .slice(offset, offset + CATALOG_PAGE_SIZE)
        .map(listing);
      hasNext = ordered.rows.length > offset + CATALOG_PAGE_SIZE;
      if ((key || tastiestView) && ordered.qualified < ordered.rows.length)
        qualified = Math.max(0, ordered.qualified - offset);
    }
    const unrankedShown = unranked.slice(0, CATALOG_PAGE_SIZE);
    // Every flavor of every line on the page, in one query.
    const flavors = await this.repository.flavors(
      market.id,
      category.id,
      [...listed, ...unrankedShown].map((row) => row.lineId),
      filters,
    );
    const withFlavors = <T extends { lineId: string }>(row: T) =>
      ({
        ...row,
        ...lineFlavors(
          flavors.filter((flavor) => flavor.lineId === row.lineId),
          tastiestView ? "tastiest" : "closest",
          this.clock(),
        ),
      }) as T & ReturnType<typeof lineFlavors>;
    // Each ranking has its own featured #1.
    const best = tastiestView ? tastiest : (closest[0] ?? null);
    return {
      view,
      category,
      availability: { here, countries: availableIn },
      questions: questions.map(({ key, label }) => ({ key, label })),
      place: this.placeOf(taxonomy, category.id),
      sidebar: await this.sidebar(market, taxonomy, category.id),
      filters,
      storeOptions,
      summary: {
        rankedCount: closest.length,
        tastiestCount: tastiestOrder.qualified,
        ratingCount: all.reduce((sum, row) => sum + row.ratingCount, 0),
        // People who said how tasty a line is; Tastiest's own population.
        tastiestPeople: all.reduce((sum, row) => sum + row.tastiestCount, 0),
        best: best && listing(best),
      },
      shownCount: shown.length,
      // Ranked lines the Free-from choice hides only because no flavor's
      // label is confirmed yet.
      notConfirmedCount: filters.freeFrom.length
        ? (tastiestView ? all : closest).filter(
            (row) => row.storeMatch && !row.confirmed,
          ).length
        : 0,
      ranked: this.labelNew(listed).map(withFlavors),
      qualified,
      unranked: this.labelNew(
        unrankedShown.map((row) => ({
          lineId: row.lineId,
          name: row.name,
          brand: row.brand,
          leadProduct: {
            id: row.id,
            slug: row.slug,
            versionId: row.versionId,
            imageId: row.imageId,
          },
          developmentOnly: row.developmentOnly,
          publishedAt: row.publishedAt ?? null,
          flavorCount: row.flavorCount,
          allergens: row.flavorCount > 1 ? null : row.allergens,
        })),
      ).map(withFlavors),
      newDays: this.newDays,
      page,
      unrankedPage,
      hasNext,
      hasNextUnranked: unranked.length > CATALOG_PAGE_SIZE,
    };
  }
  /**
   * A food's aisle, for its breadcrumb and back link. A silent aisle (Eggs ›
   * Eggs) is left out so the crumbs never repeat a name.
   */
  private placeOf(
    taxonomy: Awaited<ReturnType<CatalogRepository["taxonomy"]>>,
    categoryId: string,
  ) {
    const shape = taxonomyShape(taxonomy.categories);
    const node = shape.get(categoryId);
    const aisle = node?.aisleId ? shape.get(node.aisleId) : undefined;
    const listed = aisleTree(taxonomy.categories, new Map()).find((a) =>
      a.foods.some((food) => food.id === categoryId),
    );
    return {
      aisle:
        aisle && aisle.id !== categoryId && !listed?.silent
          ? { slug: aisle.slug, name: aisle.name }
          : null,
    };
  }
  /** The food's aisle with every food's #1 score, and the other aisles. */
  private async sidebar(
    market: Market,
    taxonomy: Awaited<ReturnType<CatalogRepository["taxonomy"]>>,
    categoryId: string,
  ) {
    const counts = new Map(taxonomy.counts.map((row) => [row.categoryId, row]));
    const aisles = aisleTree(taxonomy.categories, counts);
    const current = aisles.find((aisle) =>
      aisle.foods.some((food) => food.id === categoryId),
    );
    const foods = current?.foods ?? [];
    const top = await this.repository.topProducts(
      market.id,
      foods.map((food) => food.id),
      1,
    );
    return {
      aisle: current
        ? {
            slug: current.slug,
            name: current.name,
            foods: current.foods.map((food) => ({
              slug: food.slug,
              name: food.name,
              score:
                top.find((product) => product.categoryId === food.id)
                  ?.bayesianScore ?? null,
            })),
          }
        : null,
      otherAisles: aisles
        .filter((aisle) => aisle.slug !== current?.slug)
        .map((aisle) => ({ slug: aisle.slug, name: aisle.name })),
    };
  }

  /**
   * A product page about one of its foods (`food`, else its first active
   * food): ranks, detail scores and rating context per food, and the other
   * swaps for the chosen one.
   */
  async product(
    market: Market,
    slug: string,
    versionId: string | null,
    foodSlug: string | null = null,
  ) {
    if (versionId !== null && !/^[a-zA-Z0-9_-]{1,100}$/.test(versionId))
      throw new ApplicationError(
        "INVALID_VERSION",
        "This formula link is invalid.",
      );
    const product = await this.repository.product(market.id, slug, versionId);
    if (!product)
      throw new ApplicationError(
        "NOT_FOUND",
        "Product or formula not found.",
        404,
      );
    const [insights, taxonomy, options, siblings] = await Promise.all([
      this.repository.productInsights(market.id, product.id, product.versionId),
      this.repository.taxonomy(market.id),
      this.repository.filterOptions(market.id),
      this.repository.siblings(market.id, product.lineId, product.id),
    ]);
    const foods = product.categories.map((category) => {
      const rank = insights.ranks.find((r) => r.categoryId === category.id);
      const familiarity = insights.familiarity
        .filter((row) => row.categoryId === category.id)
        .map(({ recency, score, count }) => ({ recency, score, count }));
      return {
        ...category,
        // The line's ranks; the flavor's own scores stay on the category.
        rank: rank?.rank ?? null,
        rankedCount: rank?.rankedCount ?? 0,
        early: rank ? isEarly(rank.people) : false,
        // The line in both rankings (docs/API.md, milestone 7).
        line: rank
          ? {
              id: product.lineId,
              trending: this.isTrendingRank(rank.trendingRank),
              name: rank.flavorCount > 1 ? rank.lineName : product.name,
              flavorCount: rank.flavorCount,
              closest:
                rank.rank === null
                  ? null
                  : {
                      rank: rank.rank,
                      of: rank.rankedCount,
                      score: rank.score,
                      people: rank.people,
                      early: isEarly(rank.people),
                    },
              tastiest:
                rank.tastiestRank === null
                  ? null
                  : {
                      rank: rank.tastiestRank,
                      of: rank.tastiestCount,
                      score: rank.tastiestScore,
                      people: rank.tastiestPeople,
                      early: isEarly(rank.tastiestPeople),
                    },
            }
          : null,
        // The flavor's own scores in this food.
        flavorScores: {
          closest: {
            score: category.bayesianScore,
            count: category.ratingCount,
          },
          tastiest: {
            score: category.tastiestScore,
            count: category.tastiestCount,
          },
        },
        details: category.dimensions.map((dimension) => {
          const row = insights.details.find(
            (d) => d.categoryId === category.id && d.key === dimension.key,
          );
          return {
            key: dimension.key,
            label: dimension.label,
            count: row?.count ?? 0,
            mean:
              row && row.count >= DETAIL_MIN_ANSWERS
                ? row.sum / row.count
                : null,
          };
        }),
        recentEaters: recentEaters(familiarity),
        distribution: distribution(familiarity),
      };
    });
    const active = foods.filter((food) => food.isActive);
    const chosen =
      (foodSlug && active.find((food) => food.slug === foodSlug)) ||
      active[0] ||
      null;
    if (foodSlug && chosen?.slug !== foodSlug)
      throw new ApplicationError(
        "NOT_FOUND",
        "This product isn’t ranked for that food.",
        404,
      );
    // Other swaps leave out the product's own line.
    const others = chosen
      ? (await this.repository.topProducts(market.id, [chosen.id], 4))
          .filter((other) => other.lineId !== product.lineId)
          .slice(0, 3)
          .map(this.leaderProduct)
      : [];
    return {
      ...this.labelNew([product])[0]!,
      categories: foods,
      food: chosen?.slug ?? null,
      place: chosen ? this.placeOf(taxonomy, chosen.id) : null,
      others,
      // The chosen food's line, its other flavors and this flavor's scores.
      line: chosen?.line ?? null,
      flavorScores: chosen?.flavorScores ?? null,
      // Each links to the chosen food only where it's listed there.
      otherFlavors: siblings.map(({ foods, ...sibling }) => ({
        ...sibling,
        food: chosen && foods.includes(chosen.slug) ? chosen.slug : null,
      })),
      allergens: insights.allergens,
      allergenConfirmations: insights.allergenConfirmations,
      // The country's allergen names, for the declaration's wording.
      allergenOptions: options.allergens,
    };
  }

  // An archived duplicate's slug resolves to its survivor. Callers must
  // return the redirect uncached; consolidation is reversible.
  canonicalRedirect(market: Market, slug: string) {
    return this.repository.canonicalRedirect(market.id, slug);
  }

  async search(market: Market, input: string) {
    const { query, expression } = searchExpression(input);
    const [results, brands] = expression
      ? await Promise.all([
          this.repository.search(market.id, market.iso2, expression),
          this.repository.brands(market.id, query, 10),
        ])
      : [{ categories: [], products: [] }, []];
    return {
      query,
      categories: results.categories,
      // Up to ten brands by the shared matcher (docs/API.md, milestone 7).
      brands: brands.map((brand) => ({
        slug: brand.slug,
        name: brand.name,
        productCount: brand.productCount,
      })),
      products: this.labelNew(results.products),
    };
  }

  async profile(handle: string) {
    const profile = await this.repository.profile(handle.toLowerCase());
    if (!profile)
      throw new ApplicationError("NOT_FOUND", "Profile not found.", 404);
    return profile;
  }
}

function leaderProduct(product: TopProduct) {
  return {
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    imageId: product.imageId,
    score: product.bayesianScore,
    ratingCount: product.ratingCount,
    rank: product.rank,
    early: isEarly(product.ratingCount),
  };
}

/**
 * A line card's flavors (milestone 7): each with its own score in the current
 * ranking once it has enough answers, scored flavors first by score, the rest
 * by ratings, then name; and how many don't pass the filters.
 */
export function lineFlavors(
  rows: FlavorRow[],
  ranking: "closest" | "tastiest",
  now: number,
) {
  const flavors = rows.map((row) => {
    const count = ranking === "tastiest" ? row.tastiestCount : row.closestCount;
    const score = ranking === "tastiest" ? row.tastiestScore : row.closestScore;
    return {
      productId: row.id,
      slug: row.slug,
      name: row.name,
      flavor: row.flavor,
      label: flavorLabel(row, rows),
      imageId: row.imageId,
      // Answers in the ranking shown.
      ratingCount: count,
      score: count >= FLAVOR_SCORE_MIN_ANSWERS ? score : null,
      allergens: row.allergens,
      isNew: isNewProduct(row.publishedAt, now),
      seasonal: row.seasonal === 1,
      matchesFilters: !!row.matches,
    };
  });
  flavors.sort(
    (a, b) =>
      (b.score ?? -Infinity) - (a.score ?? -Infinity) ||
      b.ratingCount - a.ratingCount ||
      (a.flavor ?? "").localeCompare(b.flavor ?? "") ||
      a.name.localeCompare(b.name),
  );
  const matching = flavors.filter((flavor) => flavor.matchesFilters);
  return {
    flavors: matching,
    // Flavors hidden because they don't pass the filters.
    hiddenFlavorCount: flavors.length - matching.length,
    // A line every listed flavor of which is sold only part of the year.
    seasonal: matching.length > 0 && matching.every((f) => f.seasonal),
  };
}
