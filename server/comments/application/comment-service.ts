import { ApplicationError } from "../../shared/domain/errors";
import { active } from "../../community/domain/policy";
import type { Actor } from "../../community/domain/contracts";
import { receiptWrite } from "../../community/infrastructure/receipts";
import type { ModerationDecisionService } from "../../moderation/application/decision-service";
import {
  applyVote,
  bestRank,
  commentDay,
  commentEdit,
  commentInput,
  type CommentFormula,
  type CommentPolicy,
  type CommentSort,
} from "../domain/comments";
import type {
  CommentProduct,
  D1CommentRepository,
} from "../infrastructure/d1-comment-repository";

export interface SavedComment {
  id: string;
  productId: string;
  state: "visible" | "pending";
  body: string;
  updatedAt: number;
  createdAt: number;
  editedAt: number | null;
  reasons: string[];
}

/**
 * Comments are opinions about one formula. Deterministic checks run first;
 * the automated evaluation can only hold a comment for review or block
 * near-certain spam. Votes measure usefulness and never touch rankings.
 */
export class CommentService {
  constructor(
    private readonly repository: D1CommentRepository,
    private readonly decisions: ModerationDecisionService,
    private readonly policy: CommentPolicy,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}
  private async product(where: { id?: string; slug?: string }) {
    const product = await this.repository.product(where);
    if (!product)
      throw new ApplicationError("NOT_FOUND", "Product not found.", 404);
    return product;
  }
  async page(
    slug: string,
    sort: CommentSort,
    formula: CommentFormula,
    cursor: string | null,
  ) {
    const product = await this.product({ slug });
    const [page, counts] = await Promise.all([
      this.repository.page(product, sort, formula, cursor),
      this.repository.counts(product),
    ]);
    return { productId: product.id, sort, formula, ...page, counts };
  }
  async personal(actor: Actor, productId: string, ids: string[] = []) {
    active(actor);
    return this.repository.personal(productId, actor.id, ids);
  }
  private async evaluate(
    actor: Actor,
    commentId: string,
    product: CommentProduct,
    body: string,
    categoryId: string | null,
  ) {
    const decision = await this.decisions.evaluate({
      kind: "comment",
      subject: { type: "comment", id: commentId },
      userId: actor.id,
      state: {
        product: {
          brand: product.brand,
          name: product.name,
          categories: product.categories.map((c) => c.name),
          focusCategory: product.categories.find((c) => c.id === categoryId)
            ?.name,
        },
        recentComments: await this.repository.recentBodies(
          product.id,
          actor.id,
        ),
        comment: { body },
      },
    });
    if (decision.outcome === "BLOCKED")
      throw new ApplicationError(
        "COMMENT_BLOCKED",
        decision.reasons.join(" ") || "This comment cannot be posted.",
        422,
      );
    // Only an explicit hold changes publication; a disabled provider keeps
    // comments as ordinary opinions.
    return {
      state:
        decision.outcome === "NEEDS_REVIEW" ||
        decision.outcome === "NEEDS_CHANGES"
          ? ("pending" as const)
          : ("visible" as const),
      decisionId: decision.id,
      reasons:
        decision.outcome && decision.outcome !== "READY"
          ? decision.reasons
          : [],
    };
  }
  async create(actor: Actor, key: string, raw: unknown) {
    active(actor);
    const input = commentInput.parse(raw);
    const now = this.clock(),
      receipt = await receiptWrite(actor.id, "comment-create", key, input, now);
    const prior = await this.repository.replay<SavedComment>(receipt);
    if (prior) return prior;
    const product = await this.product({ id: input.productId });
    if (
      input.categoryId &&
      !product.categories.some((c) => c.id === input.categoryId)
    )
      throw new ApplicationError(
        "INVALID_CATEGORY",
        "Choose one of this product's categories.",
      );
    if (await this.repository.duplicate(actor.id, product.id, input.body))
      throw new ApplicationError(
        "DUPLICATE_COMMENT",
        "You already posted this comment on this product.",
        409,
      );
    // The quota is checked before any model call; the insert enforces it
    // again for concurrent requests.
    if (
      (await this.repository.countSince(actor.id, commentDay(now))) >=
      this.policy.perDay
    )
      throw new ApplicationError(
        "COMMENT_LIMIT",
        "Today's comment allowance is exhausted. Please try again tomorrow.",
        429,
      );
    const id = this.newId();
    const evaluation = await this.evaluate(
      actor,
      id,
      product,
      input.body,
      input.categoryId ?? null,
    );
    const saved: SavedComment = {
      id,
      productId: product.id,
      state: evaluation.state,
      body: input.body,
      createdAt: now,
      updatedAt: now,
      editedAt: null,
      reasons: evaluation.reasons,
    };
    await this.repository.create(
      {
        id,
        userId: actor.id,
        product,
        categoryId: input.categoryId ?? null,
        body: input.body,
        state: evaluation.state,
        decisionId: evaluation.decisionId,
        now,
      },
      receipt,
      saved,
    );
    return (await this.repository.replay<SavedComment>(receipt)) ?? saved;
  }
  private async owned(actor: Actor, id: string) {
    const comment = await this.repository.get(id);
    if (!comment || comment.user_id !== actor.id || comment.deleted_at)
      throw new ApplicationError("NOT_FOUND", "Comment not found.", 404);
    return comment;
  }
  async edit(actor: Actor, id: string, raw: unknown) {
    active(actor);
    const input = commentEdit.parse(raw);
    const comment = await this.owned(actor, id);
    if (!["visible", "pending"].includes(comment.moderation_state))
      throw new ApplicationError(
        "COMMENT_LOCKED",
        "A moderator has hidden this comment, so it can't be edited.",
        409,
      );
    if (comment.updated_at !== input.expectedUpdatedAt)
      throw new ApplicationError(
        "COMMENT_CHANGED",
        "This comment changed. Refresh before editing.",
        409,
      );
    if (comment.body === input.body)
      return this.saved(comment, comment.moderation_state, []);
    const product = await this.product({ id: comment.product_id });
    const evaluation = await this.evaluate(
      actor,
      id,
      product,
      input.body,
      comment.category_id,
    );
    const now = this.clock();
    if (
      !(await this.repository.edit(
        id,
        actor.id,
        input.expectedUpdatedAt,
        input.body,
        evaluation.state,
        evaluation.decisionId,
        now,
      ))
    )
      throw new ApplicationError(
        "COMMENT_CHANGED",
        "This comment changed. Refresh before editing.",
        409,
      );
    return this.saved(
      (await this.repository.get(id))!,
      evaluation.state,
      evaluation.reasons,
    );
  }
  private saved(
    row: NonNullable<Awaited<ReturnType<D1CommentRepository["get"]>>>,
    state: string,
    reasons: string[],
  ): SavedComment {
    return {
      id: row.id,
      productId: row.product_id,
      state: state === "pending" ? "pending" : "visible",
      body: row.body,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      editedAt: row.edited_at,
      reasons,
    };
  }
  async remove(actor: Actor, id: string) {
    active(actor);
    const comment = await this.owned(actor, id);
    await this.repository.remove(id, actor.id, this.clock());
    return { id, productId: comment.product_id, deleted: true };
  }
  async vote(actor: Actor, id: string, value: -1 | 0 | 1) {
    active(actor);
    // Bounded optimistic retries: each attempt re-reads the counts and fences
    // its write on the revision it read.
    for (let attempt = 0; attempt < 8; attempt++) {
      const comment = await this.repository.get(id);
      if (
        !comment ||
        comment.deleted_at ||
        comment.moderation_state !== "visible"
      )
        throw new ApplicationError("NOT_FOUND", "Comment not found.", 404);
      if (comment.user_id === actor.id)
        throw new ApplicationError(
          "OWN_COMMENT",
          "You can't vote on your own comment.",
          403,
        );
      const previous = await this.repository.currentVote(id, actor.id);
      if (previous === (value || null))
        return {
          id,
          vote: value,
          upvotes: comment.up_count,
          downvotes: comment.down_count,
        };
      const next = applyVote(
        { up: comment.up_count, down: comment.down_count },
        previous,
        value,
      );
      if (
        await this.repository.vote(
          id,
          actor.id,
          value,
          { ...next, rank: bestRank(next.up, next.down) },
          comment.vote_revision,
          this.newId(),
          this.clock(),
        )
      )
        return { id, vote: value, upvotes: next.up, downvotes: next.down };
    }
    throw new ApplicationError(
      "VOTE_BUSY",
      "Votes are changing quickly. Please retry.",
      409,
    );
  }
  /** Hourly: re-evaluate comments held because the provider was unavailable. */
  async reevaluateHeld() {
    if (!this.decisions.enabled) return 0;
    let released = 0;
    for (const comment of await this.repository.held(
      this.policy.reevaluatePerPass,
    )) {
      const latest = await this.decisions.latest("comment", comment.id);
      // Only provider failures are retried; a completed hold stays held for
      // an operator.
      if (latest && !["failed", "over_budget"].includes(latest.status))
        continue;
      const product = await this.repository.product({
        id: comment.product_id,
      });
      if (!product) continue;
      const evaluation = await this.evaluate(
        { id: comment.user_id, accountState: "active", administrator: false },
        comment.id,
        product,
        comment.body,
        comment.category_id,
      ).catch(() => null);
      if (evaluation?.state === "visible" && evaluation.decisionId) {
        await this.repository.release(
          comment.id,
          comment.updated_at,
          evaluation.decisionId,
          this.clock(),
        );
        released++;
      }
    }
    return released;
  }
}
