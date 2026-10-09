import type { CommunityProductDetails } from "../../community/domain/public";

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
}
// Discovery rows show the Top score as context; it never orders them.
export interface DiscoveryRow extends ProductSummary {
  bayesianScore: number | null;
  ratingCount: number;
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
  categories(parentId?: string): Promise<CategorySummary[]>;
  sitemap(): Promise<{
    categories: { slug: string; updatedAt: number }[];
    products: { slug: string; updatedAt: number }[];
  }>;
  trending(
    categoryId: string | null,
    offset: number,
    limit: number,
  ): Promise<DiscoveryRow[]>;
  newest(
    categoryId: string | null,
    since: number,
    offset: number,
    limit: number,
  ): Promise<DiscoveryRow[]>;
  featuredCategories(): Promise<CategorySummary[]>;
  categoryRedirect(slug: string): Promise<string | null>;
  category(slug: string): Promise<CategorySummary | null>;
  rankings(
    categoryId: string,
    offset: number,
    limit: number,
  ): Promise<RankingRow[]>;
  unranked(
    categoryId: string,
    offset: number,
    limit: number,
  ): Promise<ProductSummary[]>;
  product(
    slug: string,
    versionId: string | null,
  ): Promise<ProductDetails | null>;
  search(
    expression: string,
  ): Promise<{ categories: CategorySummary[]; products: ProductSummary[] }>;
  profile(handle: string): Promise<PublicProfile | null>;
  canonicalRedirect(slug: string): Promise<{ id: string; slug: string } | null>;
}
