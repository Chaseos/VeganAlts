import { ApplicationError } from "../../shared/domain/errors";
import type {
  CatalogRepository,
  CategoryView,
  ProductSummary,
  TopProduct,
} from "../domain/contracts";
import { startWithThese, stillWaiting, type FoodLeader } from "../domain/home";
import { DEFAULT_TRENDING } from "../../ranking/domain/trending";
import { aisleTree, taxonomyShape } from "../../taxonomy/domain/shape";
import {
  AISLE_TOP,
  HOME_LIST_SIZE,
  SUGGEST_LIMIT,
  isEarly,
} from "../../ranking/domain/display";
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
  if (input === null || input === "top") return "top";
  if (input === "trending" || input === "new") return input;
  throw new ApplicationError("INVALID_VIEW", "Choose Top, Trending or New.");
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
  sitemap() {
    return this.repository.sitemap();
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
    const storeOptions = category.isRankable
      ? this.repository.storeOptions(market.id, category.id, filters.freeFrom)
      : Promise.resolve([]);
    if (view !== "top") {
      // Trending and New are separate discovery views; they never reorder Top.
      const [rows, children, stores] = await Promise.all([
        view === "trending"
          ? this.repository.trending(
              market.id,
              category.id,
              filters,
              (page - 1) * CATALOG_PAGE_SIZE,
              CATALOG_PAGE_SIZE + 1,
            )
          : this.repository.newest(
              market.id,
              category.id,
              this.newSince(),
              filters,
              (page - 1) * CATALOG_PAGE_SIZE,
              CATALOG_PAGE_SIZE + 1,
            ),
        this.repository.categories(market.id, category.id),
        storeOptions,
      ]);
      return {
        view,
        category,
        children,
        filters,
        storeOptions: stores,
        ranked: [],
        unranked: [],
        discovery: this.labelNew(rows.slice(0, CATALOG_PAGE_SIZE)),
        newDays: this.newDays,
        page,
        unrankedPage: 1,
        hasNext: rows.length > CATALOG_PAGE_SIZE,
        hasNextUnranked: false,
      };
    }
    const [ranked, unranked, children, stores] = await Promise.all([
      this.repository.rankings(
        market.id,
        category.id,
        filters,
        (page - 1) * CATALOG_PAGE_SIZE,
        CATALOG_PAGE_SIZE + 1,
      ),
      this.repository.unranked(
        market.id,
        category.id,
        filters,
        (unrankedPage - 1) * CATALOG_PAGE_SIZE,
        CATALOG_PAGE_SIZE + 1,
      ),
      this.repository.categories(market.id, category.id),
      storeOptions,
    ]);
    return {
      view,
      category,
      children,
      filters,
      storeOptions: stores,
      discovery: [],
      newDays: this.newDays,
      ranked: this.labelNew(ranked.slice(0, CATALOG_PAGE_SIZE)),
      unranked: this.labelNew(unranked.slice(0, CATALOG_PAGE_SIZE)),
      page,
      unrankedPage,
      hasNext: ranked.length > CATALOG_PAGE_SIZE,
      hasNextUnranked: unranked.length > CATALOG_PAGE_SIZE,
    };
  }

  async product(market: Market, slug: string, versionId: string | null) {
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
    return this.labelNew([product])[0]!;
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
