/**
 * A short in-memory cache for catalog data that rarely changes and that many
 * cache misses read. It lives in one Worker instance, so a change reaches other
 * instances within `ttl`. Concurrent callers share one read; a failed read is
 * forgotten at once rather than repeated for a minute.
 */
export class ReadMemo {
  private entries = new Map<
    string,
    { promise: Promise<unknown>; at: number }
  >();
  constructor(
    private readonly ttl = 60_000,
    private readonly now = Date.now,
  ) {}
  read<T>(key: string, load: () => Promise<T>): Promise<T> {
    const found = this.entries.get(key);
    if (found && this.now() - found.at < this.ttl)
      return found.promise as Promise<T>;
    const promise = load();
    const entry = { promise, at: this.now() };
    this.entries.set(key, entry);
    promise.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return promise;
  }
}
