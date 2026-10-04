import { ApplicationError } from "../../shared/domain/errors";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const IMAGE_SLOTS = [
  "front",
  "back",
  "ingredients",
  "nutrition",
  "prepared",
] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];
export type DerivativeKind = "full" | "thumbnail" | "evidence";
export interface ImageInfo {
  width: number;
  height: number;
  format: string;
}
export interface DerivativeSpec {
  kind: DerivativeKind;
  maxEdge: number;
  quality: number;
}
export interface StoredDerivative {
  kind: DerivativeKind;
  key: string;
  width: number;
  height: number;
}

export function validateSlot(value: string): ImageSlot {
  if (!IMAGE_SLOTS.includes(value as ImageSlot))
    throw new ApplicationError(
      "INVALID_SLOT",
      "Choose a supported image slot.",
    );
  return value as ImageSlot;
}

export function validateImageBytes(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES)
    throw new ApplicationError(
      "INVALID_FILE_SIZE",
      "Choose an image no larger than 10 MiB.",
      413,
    );
  const starts = (signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (
    starts([0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return "image/webp";
  throw new ApplicationError(
    "INVALID_IMAGE",
    "Choose a valid JPEG, PNG, or WebP image.",
    415,
  );
}

export function validateImageInfo(info: ImageInfo, expectedFormat: string) {
  if (
    info.format !== expectedFormat ||
    !Number.isSafeInteger(info.width) ||
    !Number.isSafeInteger(info.height) ||
    info.width < 1 ||
    info.height < 1
  ) {
    throw new ApplicationError(
      "INVALID_IMAGE",
      "The file could not be decoded as a supported image.",
      415,
    );
  }
  if (info.width * info.height > MAX_IMAGE_PIXELS)
    throw new ApplicationError(
      "IMAGE_TOO_LARGE",
      "Choose an image with at most 40 megapixels.",
      413,
    );
}

export function derivativeSpecs(slot: ImageSlot): DerivativeSpec[] {
  return [
    { kind: "full", maxEdge: 1800, quality: 90 },
    { kind: "thumbnail", maxEdge: 500, quality: 80 },
    ...(slot === "ingredients" || slot === "nutrition"
      ? [{ kind: "evidence" as const, maxEdge: 2400, quality: 92 }]
      : []),
  ];
}

export const attemptKey = (
  attemptId: string,
  kind: DerivativeKind | "original",
) =>
  `uploads/${attemptId}/${kind === "original" ? "original" : `${kind}.webp`}`;
export const attemptKeys = (attemptId: string) =>
  (["original", "full", "thumbnail", "evidence"] as const).map((kind) =>
    attemptKey(attemptId, kind),
  );

export interface UploadInput {
  userId: string;
  productVersionId: string;
  slot: ImageSlot;
  idempotencyKey: string;
  contentHash: string;
}
export interface UploadRecord extends UploadInput {
  id: string;
  state: "pending" | "processing" | "complete" | "failed";
  imageId: string | null;
}
export interface UploadAttempt {
  id: string;
  uploadId: string;
}
export interface MediaRepository {
  reserve(input: UploadInput, id: string, now: number): Promise<UploadRecord>;
  claim(
    uploadId: string,
    attemptId: string,
    now: number,
  ): Promise<UploadAttempt | null>;
  complete(
    upload: UploadRecord,
    attempt: UploadAttempt,
    imageId: string,
    derivatives: StoredDerivative[],
    now: number,
  ): Promise<boolean>;
  fail(attempt: UploadAttempt, code: string, now: number): Promise<void>;
  recoverExpired(now: number): Promise<void>;
  canDeleteObject(key: string, now: number): Promise<boolean>;
}
export interface ImageTransformer {
  inspect(bytes: Uint8Array): Promise<ImageInfo>;
  transform(
    bytes: Uint8Array,
    spec: DerivativeSpec,
  ): Promise<{ bytes: Uint8Array; width: number; height: number }>;
}
export interface MediaStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(cursor?: string): Promise<{ keys: string[]; cursor?: string }>;
}
