import {
  ApplicationError,
  assertActiveAccount,
} from "../../shared/domain/errors";
import {
  aggregateFormula,
  type RankingParameters,
} from "../../ranking/domain/policy";
import type {
  DetailChange,
  FormulaSnapshot,
  RatingMutation,
  RatingsRepository,
} from "../domain/repository";
import type { RatingDetailsInput, SavedRating } from "../domain/contracts";

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
    details: RatingDetailsInput = {},
  ): Promise<SavedRating> {
    assertActiveAccount(actor);
    if (!Number.isInteger(score) || score < 1 || score > 5)
      throw new ApplicationError(
        "INVALID_SCORE",
        "Choose a whole-number score from 1 to 5.",
      );
    let detailChanged = false;
    const result = await this.change(versionId, actor.id, (snapshot, now) => {
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
      const change = detailChange(snapshot, categoryId, details);
      detailChanged = change.changed;
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
        details: change.details,
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
        ...savedDetails(result.snapshot, categoryId, details),
        updatedAt: rating.updatedAt,
      },
      tried: true,
      outcome:
        result.previousScore === undefined
          ? "created"
          : result.previousScore === rating.score && !detailChanged
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
    return this.change(versionId, undefined, () => ({
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
    return this.change(versionId, undefined, (snapshot) => {
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
    return this.change(versionId, undefined, (snapshot) => {
      if (!snapshot.ratings.some((rating) => rating.id === ratingId))
        throw new ApplicationError("NOT_FOUND", "Rating not found.", 404);
      return { kind: "exclude", ratingId, counted };
    });
  }

  /** Recompute aggregates for formulas whose ratings moved between categories. */
  async rebuildVersions(versionIds: string[]) {
    for (const id of versionIds)
      await this.change(id, undefined, () => ({ kind: "rebuild" }));
  }
  async rebuildPage(after: string | null = null, limit = 50) {
    const pageSize = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 50;
    const ids = await this.repository.listVersionIds(after, pageSize);
    for (const id of ids)
      await this.change(id, undefined, () => ({ kind: "rebuild" }));
    return {
      rebuilt: ids.length,
      next: ids.length === pageSize ? ids.at(-1)! : null,
    };
  }

  private async change(
    versionId: string,
    raterId: string | undefined,
    mutationFor: (snapshot: FormulaSnapshot, now: number) => RatingMutation,
  ) {
    // Optimistic retries keep math pure without splitting canonical and derived
    // writes across transactions. A losing writer recomputes from a fresh snapshot.
    for (let attempt = 0; attempt < 12; attempt++) {
      const snapshot = await this.repository.snapshot(versionId, raterId);
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
          snapshot,
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

/**
 * Validates submitted details against the food's questions and reduces them
 * to the answers that differ from what the rater has stored.
 */
function detailChange(
  snapshot: FormulaSnapshot,
  categoryId: string,
  input: RatingDetailsInput,
): { details: DetailChange; changed: boolean } {
  const questions = snapshot.dimensions.filter(
    (dimension) => dimension.categoryId === categoryId,
  );
  const stored = snapshot.rater.find((row) => row.categoryId === categoryId);
  const answers: DetailChange["answers"] = [];
  for (const [key, score] of Object.entries(input.dimensions ?? {})) {
    const dimension = questions.find((question) => question.key === key);
    if (!dimension)
      throw new ApplicationError(
        "INVALID_DIMENSION",
        "This food doesn’t ask that detail question.",
        422,
      );
    if (!dimension.isActive)
      throw new ApplicationError(
        "STALE_DIMENSIONS",
        "This food’s detail questions changed. Refresh to see the current ones.",
        409,
      );
    if ((stored?.answers[dimension.id] ?? null) !== score)
      answers.push({ dimensionId: dimension.id, score });
  }
  const recency =
    input.conventionalRecency !== undefined &&
    input.conventionalRecency !== (stored?.conventionalRecency ?? null)
      ? { value: input.conventionalRecency }
      : undefined;
  return {
    details: { answers, ...(recency ? { recency } : {}) },
    changed: answers.length > 0 || recency !== undefined,
  };
}

// The rater's details after the write: stored answers to active questions,
// overlaid with the submitted ones.
function savedDetails(
  snapshot: FormulaSnapshot,
  categoryId: string,
  input: RatingDetailsInput,
) {
  const stored = snapshot.rater.find((row) => row.categoryId === categoryId);
  const dimensions: Record<string, number> = {};
  for (const dimension of snapshot.dimensions)
    if (dimension.categoryId === categoryId && dimension.isActive) {
      const submitted = input.dimensions?.[dimension.key];
      const score =
        submitted === undefined ? stored?.answers[dimension.id] : submitted;
      if (typeof score === "number") dimensions[dimension.key] = score;
    }
  return {
    dimensions,
    conventionalRecency:
      input.conventionalRecency === undefined
        ? (stored?.conventionalRecency ?? null)
        : input.conventionalRecency,
  };
}
