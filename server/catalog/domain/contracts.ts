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
}

export interface RankingRow extends ProductSummary {
  bayesianScore: number;
  ratingCount: number;
}

export interface FormulaSummary {
  id: string;
  versionLabel: string;
  isCurrent: number;
  changeSummary: string | null;
  effectiveFrom: number | null;
}

export interface ProductCategory {
  id: string;
  slug: string;
  name: string;
  canRate: number;
  bayesianScore: number | null;
  ratingCount: number;
}

export interface ProductDetails extends ProductSummary {
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
}
