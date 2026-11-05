export const productAnalyticsSorts = ["views", "saves", "ratings"] as const;
export type ProductAnalyticsSort = (typeof productAnalyticsSorts)[number];

export interface ProductAnalytics {
  id: string;
  slug: string;
  // Lowercase ISO code of the product's country.
  country: string;
  name: string;
  brand: string | null;
  flavor: string | null;
  lifecycleStatus: string;
  views: number;
  recentViews: number;
  saves: number;
  ratings: number;
}

export interface ProductAnalyticsQuery {
  sort: ProductAnalyticsSort;
  search: string;
  recentFrom: string;
  limit: number;
  offset: number;
}

export interface ProductAnalyticsRepository {
  addView(productId: string, statDate: string): Promise<void>;
  report(query: ProductAnalyticsQuery): Promise<ProductAnalytics[]>;
}
