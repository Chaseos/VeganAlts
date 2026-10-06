import { ApplicationError } from "../../shared/domain/errors";
import type { CatalogRepository } from "../domain/contracts";

export const FEATURED_CATEGORIES = [
  "ground-beef",
  "beef-burgers",
  "milk",
  "cheddar",
  "butter",
  "eggs",
];
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

export class CatalogService {
  constructor(private readonly repository: CatalogRepository) {}

  async home() {
    const categories = await this.repository.categories();
    return {
      categories,
      featured: FEATURED_CATEGORIES.flatMap((slug) =>
        categories.filter((category) => category.slug === slug),
      ),
    };
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
      ranked: ranked.slice(0, CATALOG_PAGE_SIZE),
      unranked: unranked.slice(0, CATALOG_PAGE_SIZE),
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
    return product;
  }

  async search(input: string) {
    const { query, expression } = searchExpression(input);
    return {
      query,
      ...(expression
        ? await this.repository.search(expression)
        : { categories: [], products: [] }),
    };
  }

  async profile(handle: string) {
    const profile = await this.repository.profile(handle.toLowerCase());
    if (!profile)
      throw new ApplicationError("NOT_FOUND", "Profile not found.", 404);
    return profile;
  }
}
