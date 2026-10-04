import type {
  CanonicalRating,
  CategoryAggregate,
} from "../../ranking/domain/policy";

export interface FormulaSnapshot {
  versionId: string;
  revision: number;
  canRate: boolean;
  categories: { id: string; canRate: boolean }[];
  ratings: CanonicalRating[];
  triedUserIds: string[];
}

export type RatingMutation =
  | { kind: "upsert"; rating: CanonicalRating }
  | { kind: "delete"; userId: string; categoryId: string }
  | { kind: "tried"; userId: string; tried: boolean }
  | { kind: "exclude"; ratingId: string; counted: boolean }
  | { kind: "rebuild" };

export interface RatingsRepository {
  snapshot(versionId: string): Promise<FormulaSnapshot | null>;
  commit(
    snapshot: FormulaSnapshot,
    mutation: RatingMutation,
    aggregates: CategoryAggregate[],
    now: number,
  ): Promise<boolean>;
  listVersionIds(after: string | null, limit: number): Promise<string[]>;
}
