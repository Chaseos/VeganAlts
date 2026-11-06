import type { Language } from "../domain/languages";
import { D1CatalogRepository } from "./d1-repository";
import type { ReadMemo } from "./read-memo";

/**
 * Catalog reads for one public page render. Markets, the taxonomy and the
 * filter options are shared across renders through `shared`; a category row is
 * shared within this render only, because its loader and listing both need it.
 * Pages may be minutes stale, so this never serves private or write paths.
 */
export class PublicCatalogRepository extends D1CatalogRepository {
  private readonly categoryRows = new Map<
    string,
    ReturnType<D1CatalogRepository["category"]>
  >();
  constructor(
    db: ConstructorParameters<typeof D1CatalogRepository>[0],
    private readonly shared: ReadMemo | null,
    private readonly language: Language = "en",
  ) {
    super(db, language);
  }
  private memo<T>(key: string, load: () => Promise<T>) {
    return this.shared ? this.shared.read(key, load) : load();
  }
  override markets() {
    return this.memo("markets", () => super.markets());
  }
  override taxonomy(countryId: string) {
    return this.memo(`taxonomy:${countryId}:${this.language}`, () =>
      super.taxonomy(countryId),
    );
  }
  override filterOptions(countryId: string) {
    return this.memo(`filters:${countryId}`, () =>
      super.filterOptions(countryId),
    );
  }
  override category(countryId: string, slug: string) {
    const key = `${countryId}:${slug}`;
    const known = this.categoryRows.get(key);
    if (known) return known;
    const read = super.category(countryId, slug);
    this.categoryRows.set(key, read);
    return read;
  }
}
