import type { MediaRepository, MediaStorage } from "../domain/media";

export class MediaRecoveryService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly storage: MediaStorage,
    private readonly clock = Date.now,
  ) {}

  async recover() {
    await this.repository.recoverExpired(this.clock());
    let cursor: string | undefined;
    let removed = 0;
    do {
      const page = await this.storage.list(cursor);
      for (const key of page.keys) {
        // Check every pass, including previously cleaned attempts: an interrupted
        // worker may have finished an R2 write after an earlier cleanup pass.
        if (await this.repository.canDeleteObject(key, this.clock())) {
          await this.storage.delete(key);
          removed++;
        }
      }
      cursor = page.cursor;
    } while (cursor);
    return { removed };
  }
}
