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
  // A seasonal food's months (milestone 7); null otherwise.
  seasonStart: number | null;
  seasonEnd: number | null;
  productCount: number;
  // 1 when the category is a group or a food switched on in the country.
  available: number;
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

// A recipe line in a food (milestone 7) is shown by its lead flavor: the
// identity fields are that flavor's, and `name` is the line's name (the
// flavor's own name when the line has one flavor here).
export interface LineSummary extends ProductSummary {
  lineId: string;
  // The line's eligible flavors in the food.
  flavorCount: number;
}
// Discovery rows are recipe lines with the line's Top score as context; it
// never orders them.
export interface DiscoveryRow extends LineSummary {
  bayesianScore: number | null;
  ratingCount: number;
  recentRatingCount: number;
  matchedStores: string[];
  allergens: AllergenDeclaration | null;
}
// A ranked line of one food, before views and filters are applied. Counts
// are people: each person counts once per line.
export interface RankedRow extends LineSummary {
  bayesianScore: number;
  ratingCount: number;
  // Position in the unfiltered Closest order, so a filtered view still shows
  // where a line actually ranks.
  topRank: number;
  tastiestScore: number | null;
  tastiestCount: number;
  recentRatingCount: number;
  // Its place among the food's trending lines, if it trends.
  trendingRank: number | null;
  // A flavor matches the store choice; a flavor matches every filter.
  storeMatch: number;
  allergenMatch: number;
  // Some flavor has a confirmed allergen declaration.
  confirmed: number;
  // The lead flavor's declaration.
  allergens: AllergenDeclaration | null;
  // Chosen stores (slugs) where any eligible flavor is commonly found.
  matchedStores: string[];
  // Detail answers per question id: [people, sum of their means].
  details: Record<string, [number, number]>;
}
// One eligible flavor of a listed line, with its own scores in the food.
export interface FlavorRow {
  lineId: string;
  id: string;
  slug: string;
  name: string;
  // Null marks the line's original.
  flavor: string | null;
  // Sold only part of the year (0 or 1).
  seasonal: number;
  versionId: string;
  publishedAt: number | null;
  closestScore: number | null;
  closestCount: number;
  tastiestScore: number | null;
  tastiestCount: number;
  allergens: AllergenDeclaration | null;
  // Passes every chosen filter.
  matches: number;
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
  // Counted ratings of the food's ranked swaps (popularity, milestone 7).
  ratingCount: number;
}

// A line's place in a food's Closest ranking, shown by its lead flavor.
export interface TopProduct {
  categoryId: string;
  lineId: string;
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  bayesianScore: number;
  ratingCount: number;
  trendingRank: number | null;
  rank: number;
}

// A product on the home page, in one of its foods (Trending and New show a
// recipe line by its lead flavor, with the line's figures).
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
  // The flavor's own scores in the food.
  bayesianScore: number | null;
  ratingCount: number;
  tastiestScore: number | null;
  tastiestCount: number;
  // The food's active detail questions, in order.
  dimensions: { key: string; label: string }[];
}

export interface ProductDetails
  extends ProductSummary, CommunityProductDetails {
  lineId: string;
  flavor: string | null;
  // Sold only part of the year (0 or 1), milestone 7.
  seasonal: number;
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

// A recipe line's place in one food, in both rankings.
export interface LineStanding {
  categoryId: string;
  rank: number;
  rankedCount: number;
  score: number;
  people: number;
  tastiestRank: number | null;
  tastiestCount: number;
  tastiestScore: number | null;
  tastiestPeople: number;
  lineName: string;
  flavorCount: number;
  trendingRank: number | null;
}
// Another product of the same line.
export interface SiblingFlavor {
  id: string;
  slug: string;
  name: string;
  flavor: string | null;
  // Slugs of the active foods it's listed in.
  foods: string[];
}
// A brand with its products in a country, for search and brand pages.
export interface BrandRow {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  productCount: number;
}
// One of a brand's lines in a food, with its ranks there.
export interface BrandLineRow {
  categoryId: string;
  lineId: string;
  name: string;
  closestRank: number | null;
  closestScore: number | null;
  people: number;
  tastiestRank: number | null;
  tastiestScore: number | null;
  tastiestPeople: number;
  rankedFlavorCount: number;
  flavors: { id: string; slug: string; name: string; flavor: string | null }[];
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
    categories: { slug: string; updatedAt: number; country: string }[];
    products: { slug: string; updatedAt: number; country: string }[];
    brands: { slug: string; updatedAt: number; country: string }[];
  }>;
  trending(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ): Promise<DiscoveryRow[]>;
  newest(
    countryId: string,
    categoryId: string,
    since: number,
    filters: RankingFilters,
    offset: number,
    limit: number,
  ): Promise<DiscoveryRow[]>;
  featuredCategories(countryId: string): Promise<CategorySummary[]>;
  categoryRedirect(slug: string): Promise<string | null>;
  category(countryId: string, slug: string): Promise<CategorySummary | null>;
  foodCountries(categoryId: string): Promise<string[]>;
  foodAliases(
    countryId: string,
  ): Promise<{ categoryId: string; alias: string }[]>;
  // Lines without counted ratings yet.
  unranked(
    countryId: string,
    categoryId: string,
    filters: RankingFilters,
    offset: number,
    limit: number,
    // Only lines that first appeared before this time (or never), when set.
    publishedBefore?: number,
  ): Promise<(LineSummary & { allergens: AllergenDeclaration | null })[]>;
  // The eligible flavors of listed lines, in one query.
  flavors(
    countryId: string,
    categoryId: string,
    lineIds: string[],
    filters: RankingFilters,
  ): Promise<FlavorRow[]>;
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
    // The product's line, where the product is an eligible flavor.
    ranks: LineStanding[];
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
  // The line's other active products.
  siblings(
    countryId: string,
    lineId: string,
    productId: string,
  ): Promise<SiblingFlavor[]>;
  search(
    countryId: string,
    iso2: string,
    expression: string,
  ): Promise<{ categories: CategorySummary[]; products: ProductSummary[] }>;
  // Brands with products in the country matching typed text, best first.
  brands(countryId: string, query: string, limit: number): Promise<BrandRow[]>;
  // A brand by slug, with its product count in the country (maybe 0).
  brand(
    countryId: string,
    slug: string,
  ): Promise<Omit<BrandRow, "aliases"> | null>;
  // A brand's lines in the country, by food, with their ranks.
  brandLines(countryId: string, brandId: string): Promise<BrandLineRow[]>;
  profile(handle: string): Promise<PublicProfile | null>;
  canonicalRedirect(
    countryId: string,
    slug: string,
  ): Promise<{ id: string; slug: string } | null>;
}
