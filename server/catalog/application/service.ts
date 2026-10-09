import { ApplicationError } from "../../shared/domain/errors";
import type {
  CatalogRepository,
  CategoryView,
  DiscoveryRow,
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
import { aisleTree, taxonomyShape } from "../../taxonomy/domain/shape";
import {
  AISLE_TOP,
  DETAIL_MIN_ANSWERS,
  HOME_LIST_SIZE,
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
      "Choose Closest match, Trending, Newest, Most rated or a detail sort.",
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
  ) {}

  private labelNew<T extends ProductSummary>(products: T[]) {
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
    const counts = new Map(
      taxonomy.counts.map((row) => [
        row.categoryId,
        { productCount: row.productCount, rankedCount: row.rankedCount },
      ]),
    );
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

  // Every aisle and its shelves, including shelves without foods yet, for
  // choosing where a proposed food belongs.
  async shelves(market: Market) {
    const taxonomy = await this.repository.taxonomy(market.id);
    const nodes = [...taxonomyShape(taxonomy.categories).values()];
    const byName = <T extends { name: string }>(a: T, b: T) =>
      a.name.localeCompare(b.name);
    return nodes
      .filter((node) => node.depth === 1 && !node.isRankable)
      .sort(byName)
      .map((aisle) => ({
        id: aisle.id,
        name: aisle.name,
        shelves: nodes
          .filter((node) => node.parentId === aisle.id && !node.isRankable)
          .sort(byName)
          .map((shelf) => ({
            id: shelf.id,
            slug: shelf.slug,
            name: shelf.name,
          })),
      }))
      .filter((aisle) => aisle.shelves.length > 0);
  }

  // A category's identity and whether it is a food, without its listings.
  async summary(market: Market, slug: string) {
    const category = await this.repository.category(market.id, slug);
    if (!category)
      throw new ApplicationError("NOT_FOUND", "Category not found.", 404);
    return category;
  }

  // A group category's place: Food itself, an aisle (its own page), a shelf
  // (its aisle with the shelf selected) or a deeper group (its aisle).
  async aisle(market: Market, slug: string) {
    const taxonomy = await this.repository.taxonomy(market.id);
    const shape = taxonomyShape(taxonomy.categories);
    const node = [...shape.values()].find((item) => item.slug === slug);
    if (!node || node.isRankable)
      throw new ApplicationError("NOT_FOUND", "Aisle not found.", 404);
    if (node.depth === 0) return { kind: "root" as const };
    const aisle = shape.get(node.aisleId!)!;
    if (node.depth !== 1)
      return {
        kind: "shelf" as const,
        aisleSlug: aisle.slug,
        shelfSlug: node.depth === 2 ? node.slug : null,
      };
    const counts = new Map(taxonomy.counts.map((row) => [row.categoryId, row]));
    const byName = <T extends { name: string }>(a: T, b: T) =>
      a.name.localeCompare(b.name);
    const nodes = [...shape.values()];
    const shelves = nodes
      .filter((item) => item.parentId === aisle.id && !item.isRankable)
      .sort(byName)
      .map((shelf) => ({
        slug: shelf.slug,
        name: shelf.name,
        foods: nodes
          .filter((item) => item.parentId === shelf.id && !item.outsideDepth)
          .sort(byName),
      }));
    const foodIds = shelves.flatMap((shelf) => shelf.foods.map((f) => f.id));
    const top = await this.repository.topProducts(
      market.id,
      foodIds,
      AISLE_TOP,
    );
    return {
      kind: "aisle" as const,
      aisle: { slug: aisle.slug, name: aisle.name },
      shelves: shelves.map((shelf) => ({
        slug: shelf.slug,
        name: shelf.name,
        foods: shelf.foods.map((food) => ({
          slug: food.slug,
          name: food.name,
          productCount: counts.get(food.id)?.productCount ?? 0,
          rankedCount: counts.get(food.id)?.rankedCount ?? 0,
          top: top
            .filter((product) => product.categoryId === food.id)
            .map((product) => ({
              slug: product.slug,
              name: product.name,
              brand: product.brand,
              score: product.bayesianScore,
              ratingCount: product.ratingCount,
              rank: product.rank,
              early: isEarly(product.ratingCount),
            })),
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
    const aisles = aisleTree(taxonomy.categories, counts);
    const foods = aisles.flatMap((aisle) =>
      aisle.shelves.flatMap((shelf) => shelf.foods),
    );
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
      best: leader.best && leaderProduct(leader.best),
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
        foodCount: aisle.shelves.reduce((n, s) => n + s.foods.length, 0),
        shelves: aisle.shelves.map((shelf) => ({
          slug: shelf.slug,
          name: shelf.name,
          foods: shelf.foods.map((food) => {
            const top = best(food.id);
            return {
              slug: food.slug,
              name: food.name,
              best: top && leaderProduct(top),
            };
          }),
        })),
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
    return this.answers(market, input, SUGGEST_LIMIT, SUGGEST_LIMIT);
  }
  /** The full search page: the same answers with room for more. */
  searchResults(market: Market, input: string) {
    return this.answers(market, input, 12, 20);
  }
  private async answers(
    market: Market,
    input: string,
    foodLimit: number,
    productLimit: number,
  ) {
    const { query, expression } = searchExpression(input);
    const letters = query.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    if (!expression || letters < 2) return { query, foods: [], products: [] };
    const [results, taxonomy] = await Promise.all([
      this.repository.search(market.id, market.iso2, expression),
      this.repository.taxonomy(market.id),
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
      foods: foods.map((food) => {
        const node = shape.get(food.id);
        const aisle = node?.aisleId ? shape.get(node.aisleId) : undefined;
        const ranked = top.filter((product) => product.categoryId === food.id);
        return {
          slug: food.slug,
          name: food.name,
          aisle: aisle && aisle.id !== food.id ? aisle.name : null,
          productCount: counts.get(food.id)?.productCount ?? 0,
          rankedCount: counts.get(food.id)?.rankedCount ?? 0,
          top: ranked.map(leaderProduct),
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
    const [questions, set, storeOptions, unranked, taxonomy] =
      await Promise.all([
        this.repository.questions(category.id),
        this.repository.rankedSet(market.id, category.id, filters),
        this.repository.storeOptions(market.id, category.id, filters.freeFrom),
        this.repository.unranked(
          market.id,
          category.id,
          filters,
          (unrankedPage - 1) * CATALOG_PAGE_SIZE,
          CATALOG_PAGE_SIZE + 1,
        ),
        this.repository.taxonomy(market.id),
      ]);
    const key = detailKey(view);
    if (key && !questions.some((question) => question.key === key))
      throw new UnknownViewError();
    const all = set.map((row) => ({
      ...row,
      details: detailScores(row.details, questions),
    }));
    // Badges come from the unfiltered ranking so filters never move them.
    const badges = detailBadges(all, questions);
    const byId = new Map(all.map((row) => [row.id, row]));
    const listing = (row: (typeof all)[number] | DiscoveryRow) => {
      const ranked = byId.get(row.id);
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        brand: row.brand,
        versionId: row.versionId,
        imageId: row.imageId,
        developmentOnly: row.developmentOnly,
        publishedAt: row.publishedAt ?? null,
        topRank: ranked?.topRank ?? null,
        bayesianScore: ranked?.bayesianScore ?? null,
        ratingCount: ranked?.ratingCount ?? row.ratingCount,
        recentRatingCount: row.recentRatingCount,
        early: ranked ? isEarly(ranked.ratingCount) : false,
        matchedStores: row.matchedStores,
        allergens: row.allergens,
        details: ranked?.details ?? [],
        badges: badges.get(row.id) ?? [],
      };
    };
    const shown = all.filter((row) => row.storeMatch && row.allergenMatch);
    let listed: ReturnType<typeof listing>[];
    let hasNext: boolean;
    // The position on this page where products without enough answers for
    // a detail sort begin (they follow in Top order).
    let qualified: number | null = null;
    if (view === "trending" || view === "new") {
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
      if (key && ordered.qualified < ordered.rows.length)
        qualified = Math.max(0, ordered.qualified - offset);
    }
    const best = all[0] ?? null;
    return {
      view,
      category,
      questions: questions.map(({ key, label }) => ({ key, label })),
      place: this.placeOf(taxonomy, category.id),
      sidebar: await this.sidebar(market, taxonomy, category.id),
      filters,
      storeOptions,
      summary: {
        rankedCount: all.length,
        ratingCount: all.reduce((sum, row) => sum + row.ratingCount, 0),
        best: best && listing(best),
      },
      shownCount: shown.length,
      // Ranked products the Free-from choice hides only because their label
      // is not confirmed yet.
      notConfirmedCount: filters.freeFrom.length
        ? all.filter((row) => row.storeMatch && !row.allergens).length
        : 0,
      ranked: this.labelNew(listed),
      qualified,
      unranked: this.labelNew(unranked.slice(0, CATALOG_PAGE_SIZE)),
      newDays: this.newDays,
      page,
      unrankedPage,
      hasNext,
      hasNextUnranked: unranked.length > CATALOG_PAGE_SIZE,
    };
  }
  /** A food's aisle and shelf, for its breadcrumb and back link. */
  private placeOf(
    taxonomy: Awaited<ReturnType<CatalogRepository["taxonomy"]>>,
    categoryId: string,
  ) {
    const shape = taxonomyShape(taxonomy.categories);
    const node = shape.get(categoryId);
    const aisle = node?.aisleId ? shape.get(node.aisleId) : undefined;
    const shelf =
      node?.parentId && node.depth === 3 ? shape.get(node.parentId) : undefined;
    return {
      aisle:
        aisle && aisle.id !== categoryId
          ? { slug: aisle.slug, name: aisle.name }
          : null,
      shelf: shelf ? { slug: shelf.slug, name: shelf.name } : null,
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
      aisle.shelves.some((shelf) =>
        shelf.foods.some((food) => food.id === categoryId),
      ),
    );
    const foods = current?.shelves.flatMap((shelf) => shelf.foods) ?? [];
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
            shelves: current.shelves.map((shelf) => ({
              slug: shelf.slug,
              name: shelf.name,
              foods: shelf.foods.map((food) => ({
                slug: food.slug,
                name: food.name,
                score:
                  top.find((product) => product.categoryId === food.id)
                    ?.bayesianScore ?? null,
              })),
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
    const [insights, taxonomy, options] = await Promise.all([
      this.repository.productInsights(market.id, product.id, product.versionId),
      this.repository.taxonomy(market.id),
      this.repository.filterOptions(market.id),
    ]);
    const foods = product.categories.map((category) => {
      const rank = insights.ranks.find((r) => r.categoryId === category.id);
      const familiarity = insights.familiarity
        .filter((row) => row.categoryId === category.id)
        .map(({ recency, score, count }) => ({ recency, score, count }));
      return {
        ...category,
        rank: rank?.rank ?? null,
        rankedCount: rank?.rankedCount ?? 0,
        early: rank ? isEarly(category.ratingCount) : false,
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
    const others = chosen
      ? (await this.repository.topProducts(market.id, [chosen.id], 4))
          .filter((other) => other.id !== product.id)
          .slice(0, 3)
          .map(leaderProduct)
      : [];
    return {
      ...this.labelNew([product])[0]!,
      categories: foods,
      food: chosen?.slug ?? null,
      place: chosen ? this.placeOf(taxonomy, chosen.id) : null,
      others,
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
    const results = expression
      ? await this.repository.search(market.id, market.iso2, expression)
      : { categories: [], products: [] };
    return {
      query,
      categories: results.categories,
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
    score: product.bayesianScore,
    ratingCount: product.ratingCount,
    rank: product.rank,
    early: isEarly(product.ratingCount),
  };
}
