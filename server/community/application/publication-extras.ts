import { ApplicationError } from "../../shared/domain/errors";
import {
  changeInput,
  type Actor,
  type ProductChange,
} from "../domain/contracts";
import type { SubmissionRepository } from "../infrastructure/submission-repository";

/** The write paths a product's extras go through, owned by other modules. */
export interface ExtrasPorts {
  account(userId: string): Promise<string | null>;
  rated(
    userId: string,
    versionId: string,
    categoryId: string,
  ): Promise<boolean>;
  rate(
    userId: string,
    versionId: string,
    categoryId: string,
    score: number | null,
    enjoyment: number | null,
  ): Promise<void>;
  revision(productId: string): Promise<number>;
  propose(actor: Actor, key: string, change: ProductChange): Promise<unknown>;
}

/**
 * Applies what a contributor added with a product once it is published
 * (milestone 6): their rating (with its Tastiest answer, milestone 7),
 * through the canonical rating path and only if
 * they haven't rated that food yet, and their allergen declaration, as an
 * ordinary allergen proposal citing the published label photo. A marker
 * written with the publication keeps them until done; the hourly sweep
 * retries anything a failure left.
 */
export type RatingOutcome = "saved" | "pending" | "dropped";
// Conflicts that a later attempt can get past.
const RETRYABLE = new Set(["WRITE_CONFLICT", "STALE_PRODUCT"]);

export class PublicationExtras {
  constructor(
    private readonly receipts: SubmissionRepository,
    private readonly ports: ExtrasPorts,
  ) {}
  /**
   * The rating alone, before the contributor's response: saved now, pending
   * (a later attempt retries it) or dropped (it can never count). The marker
   * stays for `apply`, which skips a saved rating.
   */
  async applyRating(receiptId: string): Promise<RatingOutcome> {
    const marker = await this.receipts.extras(receiptId);
    if (
      !marker ||
      (marker.rating === null && marker.enjoyment == null) ||
      !marker.categoryId
    )
      return "dropped";
    if ((await this.ports.account(marker.userId)) !== "active")
      return "dropped";
    const saved = () =>
      this.ports.rated(marker.userId, marker.versionId, marker.categoryId!);
    if (await saved()) return "saved";
    const done = await this.permanent(() =>
      this.ports.rate(
        marker.userId,
        marker.versionId,
        marker.categoryId!,
        marker.rating,
        marker.enjoyment ?? null,
      ),
    );
    if (!done) return "dropped";
    return (await saved()) ? "saved" : "pending";
  }
  async apply(receiptId: string) {
    const marker = await this.receipts.extras(receiptId);
    if (!marker) return false;
    // A contributor suspended since then adds nothing further.
    if ((await this.ports.account(marker.userId)) === "active") {
      if (
        (marker.rating !== null || marker.enjoyment != null) &&
        marker.categoryId &&
        !(await this.ports.rated(
          marker.userId,
          marker.versionId,
          marker.categoryId,
        ))
      )
        await this.permanent(() =>
          this.ports.rate(
            marker.userId,
            marker.versionId,
            marker.categoryId!,
            marker.rating,
            marker.enjoyment ?? null,
          ),
        );
      if (marker.allergens)
        await this.permanent(async () =>
          this.ports.propose(
            {
              id: marker.userId,
              accountState: "active",
              administrator: false,
            },
            `extras-${receiptId}`.slice(0, 100),
            changeInput.parse({
              kind: "allergens",
              productId: marker.productId,
              expectedRevision: await this.ports.revision(marker.productId),
              declaration: marker.allergens,
              ...(marker.citedImageId
                ? { citedImageId: marker.citedImageId }
                : {}),
              evidence: {
                urls: [],
                imageIds: [],
                note: "Declared from the package label when the product was added.",
              },
            }),
          ),
        );
    }
    await this.receipts.clearExtras(receiptId);
    return true;
  }
  async sweep() {
    let applied = 0;
    for (const receiptId of await this.receipts.pendingExtras())
      if (await this.apply(receiptId).catch(() => false)) applied += 1;
    return applied;
  }
  // A refusal that will never change (not rateable, an allergen not on the
  // country's list) is dropped; a write conflict, a product that moved on, a
  // rate limit or a failure is retried later.
  // True when the work is done, false when it was dropped for good.
  private async permanent(work: () => Promise<unknown>) {
    try {
      await work();
      return true;
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.status < 500 &&
        error.status !== 429 &&
        !RETRYABLE.has(error.code)
      )
        return false;
      throw error;
    }
  }
}
