import type { CommunityProductDetails } from "../../community/domain/public";
import type { TaxonomyNode } from "../../taxonomy/domain/shape";
import type { RankingFilters } from "./filters";
import type { AllergenDeclaration } from "../../community/domain/allergens";

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  isRankable: number;
  productCount: number;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  versionId: string;
  imageId: string | null;
  developmentOnly: number;
  publishedAt?: number | null;
  // Decided when the response is built so cached HTML and hydration agree.
  isNew?: boolean;
}

export interface RankingRow extends ProductSummary {
  bayesianScore: number;
  ratingCount: number;
  // Position in the unfiltered Top order, so a filtered view still shows
  // where a product actually ranks.
  topRank: number;
  // Chosen stores (slugs) where the product is commonly found.
  matchedStores: string[];
}
// Discovery rows show the Top score as context; it never orders them.
export interface DiscoveryRow extends ProductSummary {
  bayesianScore: number | null;
  ratingCount: number;
  recentRatingCount: number;
  matchedStores: string[];
  allergens: AllergenDeclaration | null;
}
// A ranked product of one food, before views and filters are applied.
export interface RankedRow extends RankingRow {
  recentRatingCount: number;
  storeMatch: number;
  allergenMatch: number;
  allergens: AllergenDeclaration | null;
  // Detail answers per question id: [count, sum].
  details: Record<string, [number, number]>;
}

export interface MarketRow {
  id: string;
  iso2: string;
  name: string;
  hasRankings: number;
}

export interface TaxonomyCounts {
  categoryId: string;
  productCount: number;
  rankedCount: number;
}

export interface TopProduct {
  categoryId: string;
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  bayesianScore: number;
  ratingCount: number;
  rank: number;
}

// A product on the home page, in one of its foods.
export interface HomeProduct extends ProductSummary {
  foodSlug: string;
  foodName: string;
  bayesianScore: number | null;
  ratingCount: number;
  // Counted ratings added in the last seven days.
  recentRatingCount: number;
}
export interface ProductPlacement {
  productId: string;
  rank: number | null;
  bayesianScore: number | null;
  ratingCount: number;
  foodSlug: string;
  foodName: string;
}

export interface StoreOption {
  slug: string;
  name: string;
  // Ranked swaps in this food commonly found there.
  count: number;
}

export interface FilterOption {
  key: string;
  label: string;
}
export type { CategoryView } from "./ranking-view";

export interface FormulaSummary {
  id: string;
  versionLabel: string;
  isCurrent: number;
  changeSummary: string | null;
  effectiveFrom: number | null;
  effectiveDate: string | null;
  effectiveDatePrecision: string;
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
  isActive: number;
  canRate: number;
  bayesianScore: number | null;
  ratingCount: number;
  // The food's active detail questions, in order.
  dimensions: { key: string; label: string }[];
}

export interface ProductDetails
  extends ProductSummary, CommunityProductDetails {
  country: string;
  veganStatus: string;
  manufacturerLabel: string;
  lifecycleStatus: string;
  dataNotes: string | null;
  formula: FormulaSummary;
  categories: ProductCategory[];
  history: FormulaSummary[];
  images: { id: string; slot: string; hasEvidence: number }[];
}

export interface PublicProfile {
  handle: string;
  displayName: string | null;
  ratingCount: number;
  triedCount: number;
}

export interface CatalogRepository {
  markets(): Promise<MarketRow[]>;
  taxonomy(countryId: string): Promise<{
    categories: TaxonomyNode[];
    counts: TaxonomyCounts[];
  }>;
  categories(countryId: string, parentId?: string): Promise<CategorySummary[]>;
  sitemap(): Promise<{
    categories: { slug: string; updatedAt: number }[];
    products: { slug: string; updatedAt: number; country: string }[];
  }>;
  trending(
    countryId: string,
    categoryId: string | null,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ): Promise<DiscoveryRow[]>;
  newest(
    countryId: string,
    categoryId: string | null,
    since: number,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ): Promise<DiscoveryRow[]>;
  featuredCategories(countryId: string): Promise<CategorySummary[]>;
  categoryRedirect(slug: string): Promise<string | null>;
  category(countryId: string, slug: string): Promise<CategorySummary | null>;
  rankings(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ): Promise<RankingRow[]>;
  unranked(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ): Promise<(ProductSummary & { allergens: AllergenDeclaration | null })[]>;
  rankedSet(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
  ): Promise<RankedRow[]>;
  questions(
    categoryId: string,
  ): Promise<{ id: string; key: string; label: string }[]>;
  topProducts(
    countryId: string,
    categoryIds: string[],
    perFood: number,
  ): Promise<TopProduct[]>;
  homeTrending(countryId: string, limit: number): Promise<HomeProduct[]>;
  homeNewest(
    countryId: string,
    since: number,
    limit: number,
  ): Promise<HomeProduct[]>;
  productCount(countryId: string): Promise<number>;
  productPlacement(
    countryId: string,
    productIds: string[],
  ): Promise<ProductPlacement[]>;
  storeOptions(
    countryId: string,
    categoryId: string,
    freeFrom: string[],
  ): Promise<StoreOption[]>;
  filterOptions(
    countryId: string,
  ): Promise<{ stores: FilterOption[]; allergens: FilterOption[] }>;
  product(
    countryId: string,
    slug: string,
    versionId: string | null,
  ): Promise<ProductDetails | null>;
  productInsights(
    countryId: string,
    productId: string,
    versionId: string,
  ): Promise<{
    ranks: { categoryId: string; rank: number; rankedCount: number }[];
    details: { categoryId: string; key: string; count: number; sum: number }[];
    familiarity: {
      categoryId: string;
      recency: string;
      score: number;
      count: number;
    }[];
    allergens: AllergenDeclaration | null;
    allergenConfirmations: number | null;
  }>;
  search(
    countryId: string,
    iso2: string,
    expression: string,
  ): Promise<{ categories: CategorySummary[]; products: ProductSummary[] }>;
  profile(handle: string): Promise<PublicProfile | null>;
  canonicalRedirect(
    countryId: string,
    slug: string,
  ): Promise<{ id: string; slug: string } | null>;
}
