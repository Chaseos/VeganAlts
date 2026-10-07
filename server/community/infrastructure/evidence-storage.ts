import type { EvidenceStorage } from "../domain/storage";
export class R2EvidenceStorage implements EvidenceStorage {
  constructor(private readonly bucket: R2Bucket) {}
  async put(
    key: string,
    body: Uint8Array | ReadableStream<Uint8Array>,
    contentType: string,
    published = false,
  ) {
    await this.bucket.put(key, body, {
      httpMetadata: {
        contentType,
        cacheControl: published
          ? "public, max-age=31536000, immutable"
          : "private, no-store",
      },
    });
  }
  async get(key: string) {
    return (await this.bucket.get(key))?.body ?? null;
  }
  async delete(key: string) {
    await this.bucket.delete(key);
  }
}
