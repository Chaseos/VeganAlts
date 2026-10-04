import { ApplicationError } from "../../shared/domain/errors";
import {
  attemptKey,
  attemptKeys,
  derivativeSpecs,
  validateImageBytes,
  validateImageInfo,
  type ImageSlot,
  type ImageTransformer,
  type MediaRepository,
  type MediaStorage,
  type StoredDerivative,
} from "../domain/media";

export class UploadService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: MediaStorage,
    private readonly transformer: ImageTransformer,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}

  async upload(input: {
    userId: string;
    productVersionId: string;
    slot: ImageSlot;
    idempotencyKey: string;
    bytes: Uint8Array;
  }) {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.idempotencyKey))
      throw new ApplicationError(
        "INVALID_IDEMPOTENCY_KEY",
        "Use an idempotency key of 16–100 letters, digits, underscores, or hyphens.",
      );
    const format = validateImageBytes(input.bytes);
    let info;
    try {
      info = await this.transformer.inspect(input.bytes);
    } catch {
      throw new ApplicationError(
        "INVALID_IMAGE",
        "The image could not be decoded.",
        415,
      );
    }
    validateImageInfo(info, format);
    const contentHash = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          input.bytes as Uint8Array<ArrayBuffer>,
        ),
      ),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const upload = await this.repository.reserve(
      { ...input, contentHash },
      this.newId(),
      this.clock(),
    );
    if (
      upload.contentHash !== contentHash ||
      upload.slot !== input.slot ||
      upload.productVersionId !== input.productVersionId
    ) {
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was used for a different upload.",
        409,
      );
    }
    if (upload.state === "complete")
      return {
        state: "complete" as const,
        uploadId: upload.id,
        imageId: upload.imageId,
      };
    const attempt = await this.repository.claim(
      upload.id,
      this.newId(),
      this.clock(),
    );
    if (!attempt)
      throw new ApplicationError(
        "UPLOAD_BUSY_OR_LIMITED",
        "This upload is processing, has reached its retry limit, or today's upload allowance is exhausted. Try again later with the same key.",
        429,
      );
    const derivatives: StoredDerivative[] = [];
    try {
      await this.storage.put(
        attemptKey(attempt.id, "original"),
        input.bytes,
        format,
      );
      for (const spec of derivativeSpecs(input.slot)) {
        const output = await this.transformer.transform(input.bytes, spec);
        const key = attemptKey(attempt.id, spec.kind);
        await this.storage.put(key, output.bytes, "image/webp");
        derivatives.push({
          kind: spec.kind,
          key,
          width: output.width,
          height: output.height,
        });
      }
      const imageId = this.newId();
      if (
        !(await this.repository.complete(
          upload,
          attempt,
          imageId,
          derivatives,
          this.clock(),
        ))
      ) {
        throw new ApplicationError(
          "UPLOAD_EXPIRED",
          "Processing expired. Please retry with the same key.",
          409,
        );
      }
      // Removing the original is best effort; scheduled recovery handles an R2
      // outage here. A completed upload must still return its committed image.
      try {
        await this.storage.delete(attemptKey(attempt.id, "original"));
      } catch {
        /* scheduled cleanup */
      }
      return { state: "complete" as const, uploadId: upload.id, imageId };
    } catch (error) {
      await this.repository.fail(
        attempt,
        error instanceof ApplicationError ? error.code : "PROCESSING_FAILED",
        this.clock(),
      );
      for (const key of attemptKeys(attempt.id)) {
        try {
          if (await this.repository.canDeleteObject(key, this.clock()))
            await this.storage.delete(key);
        } catch {
          /* scheduled cleanup */
        }
      }
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        "PROCESSING_FAILED",
        "The image could not be processed. Retry using the same key.",
        502,
      );
    }
  }
}
