import type { CommunityProductDetails } from "../../community/domain/public";
import type { TaxonomyNode } from "../../taxonomy/domain/shape";
import type { RankingFilters } from "./filters";

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
  matchedStores: string[];
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
export type CategoryView = "top" | "trending" | "new";

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
  ): Promise<ProductSummary[]>;
  topProducts(
    countryId: string,
    categoryIds: string[],
    perFood: number,
  ): Promise<TopProduct[]>;
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
