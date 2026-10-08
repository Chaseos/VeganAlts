import { ApplicationError } from "../../shared/domain/errors";
import {
  derivativeSpecs,
  validateImageBytes,
  validateImageInfo,
  type ImageSlot,
  type ImageTransformer,
  type StoredDerivative,
} from "../../media/domain/media";
import type { Actor } from "../domain/contracts";
import type { EvidenceStorage } from "../domain/storage";
import { active, fingerprint } from "../domain/policy";
import {
  StagedMediaRepository,
  type StagedAttachment,
} from "../infrastructure/staged-media-repository";

export class StagedMediaService {
  constructor(
    private readonly repository: StagedMediaRepository,
    private readonly bucket: EvidenceStorage,
    private readonly transformer: ImageTransformer,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}
  async upload(
    actor: Actor,
    input: {
      receiptId: string;
      slot: ImageSlot;
      idempotencyKey: string;
      bytes: Uint8Array;
    },
  ) {
    active(actor);
    const receipt = await this.repository.receipt(input.receiptId);
    if (!receipt || receipt.user_id !== actor.id)
      throw new ApplicationError("NOT_FOUND", "Submission not found.", 404);
    if (receipt.state !== "staging" || receipt.expires_at <= this.clock())
      throw new ApplicationError(
        "SUBMISSION_CLOSED",
        "This submission no longer accepts uploads.",
        409,
      );
    const format = validateImageBytes(input.bytes);
    const hash = await fingerprint(input.bytes);
    const profile =
      input.slot === "ingredients" || input.slot === "nutrition"
        ? "evidence-v1"
        : "standard-v1";
    const blob = await this.repository.reserve({
      userId: actor.id,
      submissionId: receipt.id,
      slot: input.slot,
      key: input.idempotencyKey,
      hash,
      profile,
      bytes: input.bytes.length,
      blobId: this.newId(),
      imageId: this.newId(),
      now: this.clock(),
    });
    if (blob.state === "complete") return this.result(receipt.id, input.slot);
    const attemptId = this.newId();
    if (!(await this.repository.claim(blob, actor.id, attemptId, this.clock())))
      throw new ApplicationError(
        "UPLOAD_BUSY_OR_LIMITED",
        "This upload is processing or its allowance is exhausted. Retry later using the same request.",
        429,
      );
    const prefix = `tmp/submissions/${attemptId}/`;
    try {
      const info = await this.transformer.inspect(input.bytes);
      validateImageInfo(info, format);
      await this.bucket.put(`${prefix}original`, input.bytes, format);
      const derivatives: StoredDerivative[] = [];
      for (const spec of derivativeSpecs(input.slot)) {
        const output = await this.transformer.transform(input.bytes, spec);
        const key = `${prefix}${spec.kind}.webp`;
        await this.bucket.put(key, output.bytes, "image/webp");
        derivatives.push({
          kind: spec.kind,
          key,
          width: output.width,
          height: output.height,
        });
      }
      if (
        !(await this.repository.complete(
          blob.id,
          attemptId,
          derivatives,
          this.clock(),
        ))
      )
        throw new ApplicationError(
          "UPLOAD_EXPIRED",
          "Processing expired. Please retry.",
          409,
        );
      try {
        await this.bucket.delete(`${prefix}original`);
      } catch {
        /* hourly recovery */
      }
      return this.result(receipt.id, input.slot);
    } catch (error) {
      await this.repository.fail(blob.id, attemptId, this.clock());
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        "PROCESSING_FAILED",
        "The photo could not be processed. Retry with the same request.",
        502,
      );
    }
  }
  private async result(receiptId: string, slot: ImageSlot) {
    const attachment = (await this.repository.attachments(receiptId)).find(
      (a) => a.slot === slot,
    );
    if (!attachment || attachment.state !== "complete")
      throw new ApplicationError(
        "UPLOAD_INCOMPLETE",
        "Wait for this upload to finish.",
        409,
      );
    return { imageId: attachment.imageId, slot, state: "complete" as const };
  }
  async read(actor: Actor, receiptId: string, imageId: string, kind: string) {
    active(actor);
    const receipt = await this.repository.receipt(receiptId);
    if (
      !receipt ||
      (receipt.user_id !== actor.id && !actor.administrator) ||
      (receipt.state !== "published" && receipt.expires_at <= this.clock()) ||
      ["expired", "rejected"].includes(receipt.state)
    )
      throw new ApplicationError("NOT_FOUND", "Evidence not found.", 404);
    const image = (await this.repository.attachments(receiptId)).find(
      (a) => a.imageId === imageId,
    );
    const derivative = image?.derivatives.find((d) => d.kind === kind);
    if (!derivative || image?.state !== "complete")
      throw new ApplicationError("NOT_FOUND", "Evidence not found.", 404);
    const object = await this.bucket.get(derivative.key);
    if (!object)
      throw new ApplicationError("NOT_FOUND", "Evidence not found.", 404);
    return object;
  }
  /** Normalized full-size derivatives for automated evidence checks. */
  async decisionImages(receiptId: string) {
    const images = [];
    for (const image of await this.repository.attachments(receiptId)) {
      const full = image.derivatives.find((d) => d.kind === "full");
      const object = full && (await this.bucket.get(full.key));
      if (image.state !== "complete" || !object)
        throw new ApplicationError(
          "EVIDENCE_EXPIRED",
          "The staged evidence is unavailable. Please upload it again.",
          409,
        );
      images.push({
        slot: image.slot,
        contentHash: image.contentHash,
        contentType: "image/webp" as const,
        bytes: new Uint8Array(await new Response(object).arrayBuffer()),
      });
    }
    return images;
  }
  async promote(
    receiptId: string,
    productId: string,
    versionId: string,
    token: string,
  ): Promise<StagedAttachment[]> {
    const attachments = await this.repository.attachments(receiptId);
    const promoted: StagedAttachment[] = [];
    for (const image of attachments) {
      if (image.state !== "complete")
        throw new ApplicationError(
          "UPLOAD_INCOMPLETE",
          "Finish every photo upload before submitting.",
          409,
        );
      // Each lease owns different keys: late writes and cleanup from an expired
      // publication can never overwrite or delete a successful retry's objects.
      const derivatives = image.derivatives.map((d) => ({
        ...d,
        key: `products/${productId}/${versionId}/${image.imageId}/${token}/${d.kind}.webp`,
      }));
      await this.repository.promotion(
        receiptId,
        image.imageId,
        derivatives,
        token,
        this.clock(),
      );
      for (let i = 0; i < derivatives.length; i++) {
        const object = await this.bucket.get(image.derivatives[i]!.key);
        if (!object)
          throw new ApplicationError(
            "EVIDENCE_EXPIRED",
            "The staged evidence is unavailable. Please submit it again.",
            409,
          );
        await this.bucket.put(derivatives[i]!.key, object, "image/webp", true);
      }
      promoted.push({ ...image, derivatives });
    }
    return promoted;
  }
}
