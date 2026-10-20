import type { CatalogBatch } from "@server/catalog/domain/batches";

type Sections = Record<string, CatalogBatch<unknown>[]>;
interface Entry {
  sections: Sections;
  savedAt: number;
  bytes: number;
  open: Record<string, string[]>;
}

/** Memory only: a reload never replays requests or retains someone else's tab. */
export class BrowseCache {
  private entries = new Map<string, Entry>();
  private sizes = new WeakMap<object, number>();
  private size(batch: CatalogBatch<unknown>) {
    let size = this.sizes.get(batch);
    if (size === undefined) {
      const json = JSON.stringify(batch);
      // Conservative string accounting; old immutable batches are measured
      // once, so an append never serializes the visitor's whole loaded list.
      size = Math.max(
        json.length * 2,
        new TextEncoder().encode(json).byteLength,
      );
      this.sizes.set(batch, size);
    }
    return size;
  }
  constructor(
    private now = Date.now,
    private maxBytes = 5 * 1024 * 1024,
  ) {}
  private prune() {
    for (const [key, entry] of this.entries)
      if (this.now() - entry.savedAt >= 10 * 60_000) this.entries.delete(key);
  }
  read<T>(context: string, section: string): CatalogBatch<T>[] | undefined {
    this.prune();
    const entry = this.entries.get(context);
    if (!entry) return;
    this.entries.delete(context);
    this.entries.set(context, entry);
    // Each section is written and read by the same typed list owner.
    return entry.sections[section] as CatalogBatch<T>[] | undefined;
  }
  readOpen(context: string, section: string) {
    return this.entries.get(context)?.open[section] ?? [];
  }
  write<T>(
    context: string,
    section: string,
    batches: CatalogBatch<T>[],
    openLines?: string[],
  ) {
    this.prune();
    const sections = {
      ...this.entries.get(context)?.sections,
      [section]: batches,
    };
    const open = {
      ...this.entries.get(context)?.open,
      ...(openLines ? { [section]: openLines } : {}),
    };
    const bytes =
      Object.values(sections)
        .flat()
        .reduce((total, batch) => total + this.size(batch), 0) +
      JSON.stringify(open).length * 2 +
      context.length * 2;
    this.entries.delete(context);
    if (bytes > this.maxBytes) return;
    this.entries.set(context, { sections, open, bytes, savedAt: this.now() });
    while (
      this.entries.size > 3 ||
      [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0) >
        this.maxBytes
    )
      this.entries.delete(this.entries.keys().next().value!);
  }
}
export const browseCache = new BrowseCache();

export function appendBatch<T>(
  batches: CatalogBatch<T>[],
  next: CatalogBatch<T>,
  identity: (item: T) => string,
) {
  const seen = new Set(batches.flatMap((batch) => batch.items.map(identity)));
  const items = next.items.filter((item) => {
    const id = identity(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  // Earlier batches and items keep their references for memoized rendering.
  const boundaryShown = batches.some(
    (batch) =>
      batch.boundaryId &&
      batch.items.some((item) => identity(item) === batch.boundaryId),
  );
  return [
    ...batches,
    { ...next, items, boundaryId: boundaryShown ? null : next.boundaryId },
  ];
}
