import type { RatingCursor } from "../../ratings/domain/contracts";

export interface SavedProduct {
  // The product the person saved. Removing uses this ID even when an archived
  // duplicate shows its surviving product.
  productId: string;
  slug: string;
  // Lowercase ISO code of the product's country.
  country: string;
  name: string;
  brand: string | null;
  flavor: string | null;
  lifecycleStatus: string;
  imageId: string | null;
  savedAt: number;
}

export interface SavedProductsRepository {
  savedIds(userId: string, productIds: string[]): Promise<string[]>;
  exists(productId: string): Promise<boolean>;
  save(userId: string, productId: string, now: number): Promise<void>;
  remove(userId: string, productId: string): Promise<void>;
  list(
    userId: string,
    cursor: RatingCursor | null,
    limit: number,
  ): Promise<SavedProduct[]>;
}
