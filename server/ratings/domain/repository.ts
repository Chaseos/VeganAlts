import type {
  CanonicalRating,
  CategoryAggregate,
} from "../../ranking/domain/policy";
import type { ConventionalRecency } from "./details";

export interface SnapshotDimension {
  id: string;
  categoryId: string;
  key: string;
  isActive: boolean;
}
// One rater's stored details, read with the snapshot when a rater is named.
export interface RaterDetails {
  categoryId: string;
  conventionalRecency: ConventionalRecency | null;
  // Score by dimension id.
  answers: Record<string, number>;
}

export interface FormulaSnapshot {
  versionId: string;
  revision: number;
  canRate: boolean;
  archived: boolean;
  categories: { id: string; canRate: boolean }[];
  dimensions: SnapshotDimension[];
  ratings: CanonicalRating[];
  triedUserIds: string[];
  rater: RaterDetails[];
}

export interface DetailChange {
  // Score by dimension id; null removes the answer.
  answers: { dimensionId: string; score: number | null }[];
  // Present only when the recency answer is being set or cleared.
  recency?: { value: ConventionalRecency | null };
}

export type RatingMutation =
  | { kind: "upsert"; rating: CanonicalRating; details?: DetailChange }
  | { kind: "delete"; userId: string; categoryId: string }
  | { kind: "tried"; userId: string; tried: boolean }
  | { kind: "exclude"; ratingId: string; counted: boolean }
  | { kind: "rebuild" };

export interface RatingsRepository {
  snapshot(
    versionId: string,
    raterId?: string,
  ): Promise<FormulaSnapshot | null>;
  commit(
    snapshot: FormulaSnapshot,
    mutation: RatingMutation,
    aggregates: CategoryAggregate[],
    now: number,
  ): Promise<boolean>;
  listVersionIds(after: string | null, limit: number): Promise<string[]>;
}
