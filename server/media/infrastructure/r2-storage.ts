import type { MediaStorage } from "../domain/media";

export class R2MediaStorage implements MediaStorage {
  constructor(private readonly bucket: R2Bucket) {}
  async put(key: string, bytes: Uint8Array, contentType: string) {
    try {
      await this.bucket.put(key, bytes, {
        httpMetadata: {
          contentType,
          cacheControl: key.endsWith(".webp")
            ? "public, max-age=31536000, immutable"
            : "private, no-store",
        },
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "dependency_failed",
          dependency: "r2",
          operation: "put",
        }),
      );
      throw error;
    }
  }
  async delete(key: string) {
    await this.bucket.delete(key);
  }
  async list(cursor?: string) {
    const page = await this.bucket.list({
      prefix: "uploads/",
      limit: 100,
      cursor,
    });
    return {
      keys: page.objects.map((object) => object.key),
      cursor: page.truncated ? page.cursor : undefined,
    };
  }
}
