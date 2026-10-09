import { z } from "zod";
import { isRecordId, isSimilarityScore } from "./selection";
import {
  CONVENTIONAL_RECENCY,
  DIMENSION_KEY,
  MAX_DIMENSIONS,
  type ConventionalRecency,
} from "./details";

export const recordId = z.custom<string>(isRecordId);
const similarity = z.custom<number>(isSimilarityScore);
export const ratingInput = z
  .object({
    productVersionId: recordId,
    categoryId: recordId,
    overallSimilarity: similarity,
    // Absent fields leave stored details unchanged; null clears one.
    dimensions: z
      .record(z.string().regex(DIMENSION_KEY), similarity.nullable())
      .refine((value) => Object.keys(value).length <= MAX_DIMENSIONS)
      .optional(),
    conventionalRecency: z.enum(CONVENTIONAL_RECENCY).nullable().optional(),
    challengeToken: z.string().max(2048).optional(),
  })
  .strict();
export type RatingInput = z.infer<typeof ratingInput>;
export type RatingDetailsInput = Pick<
  RatingInput,
  "dimensions" | "conventionalRecency"
>;

export interface PersonalRating {
  id: string;
  productVersionId: string;
  categoryId: string;
  overallSimilarity: number;
  // Answers to the food's active detail questions, by key.
  dimensions: Record<string, number>;
  conventionalRecency: ConventionalRecency | null;
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

export interface MyRating extends Omit<
  PersonalRating,
  "dimensions" | "conventionalRecency"
> {
  productId: string;
  productSlug: string;
  // Lowercase ISO code of the product's country.
  country: string;
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
