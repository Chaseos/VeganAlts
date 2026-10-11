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
    score: number,
  ): Promise<void>;
  revision(productId: string): Promise<number>;
  propose(actor: Actor, key: string, change: ProductChange): Promise<unknown>;
}

/**
 * Applies what a contributor added with a product once it is published
 * (milestone 6): their rating, through the canonical rating path and only if
 * they haven't rated that food yet, and their allergen declaration, as an
 * ordinary allergen proposal citing the published label photo. A marker
 * written with the publication keeps them until done; the hourly sweep
 * retries anything a failure left.
 */
export class PublicationExtras {
  constructor(
    private readonly receipts: SubmissionRepository,
    private readonly ports: ExtrasPorts,
  ) {}
  // `"rating"` applies only the rating, a quick write the contributor sees
  // next, and keeps the marker for the declaration.
  async apply(receiptId: string, part?: "rating") {
    const marker = await this.receipts.extras(receiptId);
    if (!marker) return false;
    // A contributor suspended since then adds nothing further.
    if ((await this.ports.account(marker.userId)) === "active") {
      if (
        marker.rating &&
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
            marker.rating!,
          ),
        );
      if (part === "rating") return true;
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
  // country's list) is dropped; anything else is retried later.
  private async permanent(work: () => Promise<unknown>) {
    try {
      await work();
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.status < 500 &&
        error.status !== 409 &&
        error.status !== 429
      )
        return;
      throw error;
    }
  }
}
