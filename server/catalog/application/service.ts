import { ApplicationError } from "../../shared/domain/errors";
import type {
  CatalogRepository,
  CategoryView,
  ProductSummary,
} from "../domain/contracts";
import { DEFAULT_TRENDING } from "../../ranking/domain/trending";
import { aisleTree } from "../../taxonomy/domain/shape";
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

  async home(market: Market) {
    const [categories, featured, trending, newest] = await Promise.all([
      this.repository.categories(market.id),
      this.repository.featuredCategories(market.id),
      this.repository.trending(market.id, null, NO_FILTERS, 0, 6),
      this.repository.newest(
        market.id,
        null,
        this.newSince(),
        NO_FILTERS,
        0,
        6,
      ),
    ]);
    // Merchandising is configured data, independent of taxonomy depth.
    return {
      categories,
      featured: featured.length ? featured : categories.slice(0, 6),
      trending: this.labelNew(trending),
      newest: this.labelNew(newest),
      newDays: this.newDays,
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
