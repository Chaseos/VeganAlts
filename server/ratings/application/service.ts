import {
  ApplicationError,
  assertActiveAccount,
} from "../../shared/domain/errors";
import {
  aggregateFormula,
  type RankingParameters,
} from "../../ranking/domain/policy";
import type {
  FormulaSnapshot,
  RatingMutation,
  RatingsRepository,
} from "../domain/repository";
import type { SavedRating } from "../domain/contracts";

export class RatingsService {
  constructor(
    private readonly repository: RatingsRepository,
    private readonly parameters: RankingParameters,
    private readonly newId: () => string,
    private readonly clock: () => number = Date.now,
  ) {}

  async rate(
    actor: { id: string; accountState: string },
    versionId: string,
    categoryId: string,
    score: number,
  ): Promise<SavedRating> {
    assertActiveAccount(actor);
    if (!Number.isInteger(score) || score < 1 || score > 5)
      throw new ApplicationError(
        "INVALID_SCORE",
        "Choose a whole-number score from 1 to 5.",
      );
    const result = await this.change(versionId, (snapshot, now) => {
      if (
        !snapshot.canRate ||
        !snapshot.categories.some(
          (category) => category.id === categoryId && category.canRate,
        )
      ) {
        throw new ApplicationError(
          "NOT_RATEABLE",
          "This formula and category cannot currently be rated.",
          409,
        );
      }
      const existing = snapshot.ratings.find(
        (rating) =>
          rating.userId === actor.id && rating.categoryId === categoryId,
      );
      return {
        kind: "upsert",
        rating: {
          id: existing?.id ?? this.newId(),
          userId: actor.id,
          categoryId,
          score,
          isCounted: existing?.isCounted ?? true,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        },
      };
    });
    if (result.mutation.kind !== "upsert")
      throw new Error("Expected a rating write.");
    const rating = result.mutation.rating;
    return {
      rating: {
        id: rating.id,
        productVersionId: versionId,
        categoryId: rating.categoryId,
        overallSimilarity: rating.score,
        updatedAt: rating.updatedAt,
      },
      tried: true,
      outcome:
        result.previousScore === undefined
          ? "created"
          : result.previousScore === rating.score
            ? "unchanged"
            : "updated",
    };
  }

  async remove(
    actor: { id: string; accountState: string },
    versionId: string,
    categoryId: string,
  ) {
    assertActiveAccount(actor);
    return this.change(versionId, () => ({
      kind: "delete",
      userId: actor.id,
      categoryId,
    }));
  }

  async setTried(
    actor: { id: string; accountState: string },
    versionId: string,
    tried: boolean,
  ) {
    assertActiveAccount(actor);
    return this.change(versionId, (snapshot) => {
      if (tried && snapshot.archived)
        throw new ApplicationError(
          "ARCHIVED_PRODUCT",
          "Archived products cannot receive new contributions.",
          409,
        );
      if (
        !tried &&
        snapshot.ratings.some((rating) => rating.userId === actor.id)
      ) {
        throw new ApplicationError(
          "RATING_REQUIRES_TRIED",
          "Remove your ratings before removing Tried state.",
          409,
        );
      }
      return { kind: "tried", userId: actor.id, tried };
    });
  }

  // Internal maintenance entry point; only the admin composition exposes it.
  async setCounted(versionId: string, ratingId: string, counted: boolean) {
    return this.change(versionId, (snapshot) => {
      if (!snapshot.ratings.some((rating) => rating.id === ratingId))
        throw new ApplicationError("NOT_FOUND", "Rating not found.", 404);
      return { kind: "exclude", ratingId, counted };
    });
  }

  async rebuildPage(after: string | null = null, limit = 50) {
    const pageSize = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 50;
    const ids = await this.repository.listVersionIds(after, pageSize);
    for (const id of ids) await this.change(id, () => ({ kind: "rebuild" }));
    return {
      rebuilt: ids.length,
      next: ids.length === pageSize ? ids.at(-1)! : null,
    };
  }

  private async change(
    versionId: string,
    mutationFor: (snapshot: FormulaSnapshot, now: number) => RatingMutation,
  ) {
    // Optimistic retries keep math pure without splitting canonical and derived
    // writes across transactions. A losing writer recomputes from a fresh snapshot.
    for (let attempt = 0; attempt < 12; attempt++) {
      const snapshot = await this.repository.snapshot(versionId);
      if (!snapshot)
        throw new ApplicationError("NOT_FOUND", "Formula not found.", 404);
      const now = this.clock();
      const mutation = mutationFor(snapshot, now);
      let ratings = [...snapshot.ratings];
      const tried = new Set(snapshot.triedUserIds);
      switch (mutation.kind) {
        case "upsert":
          ratings = ratings
            .filter((rating) => rating.id !== mutation.rating.id)
            .concat(mutation.rating);
          tried.add(mutation.rating.userId);
          break;
        case "delete":
          ratings = ratings.filter(
            (rating) =>
              !(
                rating.userId === mutation.userId &&
                rating.categoryId === mutation.categoryId
              ),
          );
          break;
        case "tried":
          mutation.tried
            ? tried.add(mutation.userId)
            : tried.delete(mutation.userId);
          break;
        case "exclude":
          ratings = ratings.map((rating) =>
            rating.id === mutation.ratingId
              ? { ...rating, isCounted: mutation.counted }
              : rating,
          );
          break;
        case "rebuild":
          break;
      }
      const aggregates = aggregateFormula(
        snapshot.categories.map((category) => category.id),
        ratings,
        [...tried],
        this.parameters,
        now,
      );
      if (await this.repository.commit(snapshot, mutation, aggregates, now))
        return {
          aggregates,
          mutation,
          previousScore:
            mutation.kind === "upsert"
              ? snapshot.ratings.find(
                  (rating) => rating.id === mutation.rating.id,
                )?.score
              : undefined,
        };
    }
    throw new ApplicationError(
      "WRITE_CONFLICT",
      "This product is being updated. Please try again.",
      409,
    );
  }
}
