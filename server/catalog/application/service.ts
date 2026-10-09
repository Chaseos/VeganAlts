import { ApplicationError } from "../../shared/domain/errors";
import type { CatalogRepository, ProductSummary } from "../domain/contracts";

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

export class CatalogService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly clock = Date.now,
  ) {}

  private labelNew<T extends ProductSummary>(products: T[]) {
    const now = this.clock();
    return products.map((product) => ({
      ...product,
      isNew: isNewProduct(product.publishedAt, now),
    }));
  }

  async home() {
    const [categories, featured] = await Promise.all([
      this.repository.categories(),
      this.repository.featuredCategories(),
    ]);
    // Merchandising is configured data, independent of taxonomy depth.
    return {
      categories,
      featured: featured.length ? featured : categories.slice(0, 6),
    };
  }
  // A renamed or merged category's former slug. Callers redirect uncached.
  categoryRedirect(slug: string) {
    return this.repository.categoryRedirect(slug);
  }

  async category(slug: string, page = 1, unrankedPage = 1) {
    const category = await this.repository.category(slug);
    if (!category)
      throw new ApplicationError("NOT_FOUND", "Category not found.", 404);
    const [ranked, unranked, children] = await Promise.all([
      this.repository.rankings(
        category.id,
        (page - 1) * CATALOG_PAGE_SIZE,
        CATALOG_PAGE_SIZE + 1,
      ),
      this.repository.unranked(
        category.id,
        (unrankedPage - 1) * CATALOG_PAGE_SIZE,
        CATALOG_PAGE_SIZE + 1,
      ),
      this.repository.categories(category.id),
    ]);
    return {
      category,
      children,
      ranked: this.labelNew(ranked.slice(0, CATALOG_PAGE_SIZE)),
      unranked: this.labelNew(unranked.slice(0, CATALOG_PAGE_SIZE)),
      page,
      unrankedPage,
      hasNext: ranked.length > CATALOG_PAGE_SIZE,
      hasNextUnranked: unranked.length > CATALOG_PAGE_SIZE,
    };
  }

  async product(slug: string, versionId: string | null) {
    if (versionId !== null && !/^[a-zA-Z0-9_-]{1,100}$/.test(versionId))
      throw new ApplicationError(
        "INVALID_VERSION",
        "This formula link is invalid.",
      );
    const product = await this.repository.product(slug, versionId);
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
  canonicalRedirect(slug: string) {
    return this.repository.canonicalRedirect(slug);
  }

  async search(input: string) {
    const { query, expression } = searchExpression(input);
    const results = expression
      ? await this.repository.search(expression)
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
