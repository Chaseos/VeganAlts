import { z } from "zod";
import { isRecordId, isSimilarityScore } from "./selection";

export const recordId = z.custom<string>(isRecordId);
export const ratingInput = z
  .object({
    productVersionId: recordId,
    categoryId: recordId,
    overallSimilarity: z.custom<number>(isSimilarityScore),
    challengeToken: z.string().max(2048).optional(),
  })
  .strict();
export type RatingInput = z.infer<typeof ratingInput>;

export interface PersonalRating {
  id: string;
  productVersionId: string;
  categoryId: string;
  overallSimilarity: number;
  updatedAt: number;
}

export interface SavedRating {
  rating: PersonalRating;
  tried: true;
  outcome: "created" | "updated" | "unchanged";
}

export interface RatingState {
  user: {
    handle: string;
    displayName: string | null;
    // Private: lets operator navigation render for allowlisted accounts.
    administrator: boolean;
  } | null;
  ratings: PersonalRating[];
  triedVersionIds: string[];
  turnstileSiteKey: string | null;
}

export interface MyRating extends PersonalRating {
  productId: string;
  productSlug: string;
  productName: string;
  brand: string | null;
  categorySlug: string;
  categoryName: string;
  versionLabel: string;
  isCurrent: number;
  canRate: number;
  imageId: string | null;
  archivedDuplicate?: number;
  canonicalSlug?: string | null;
}

export interface RatingCursor {
  updatedAt: number;
  id: string;
}
export interface PersonalRatingsRepository {
  state(
    userId: string,
    versionIds: string[],
  ): Promise<Pick<RatingState, "ratings" | "triedVersionIds">>;
  list(
    userId: string,
    cursor: RatingCursor | null,
    limit: number,
  ): Promise<MyRating[]>;
}
