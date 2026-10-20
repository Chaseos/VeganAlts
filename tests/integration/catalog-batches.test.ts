import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { catalogFixture, testMarket } from "./fixtures";

it("continues thin ranking batches with global ranks and one qualification boundary", async () => {
  const f = await catalogFixture(env.DB, 0);
  const prefix = `batch-${crypto.randomUUID()}-`;
  const category = f.categories[0]!;
  const series =
    "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<65)";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO product_families(id,country_id,canonical_name,slug,created_at,updated_at) ${series} SELECT 'line-'||?||i,?,?||i,'line-'||?||i,1,1 FROM n`,
    ).bind(prefix, f.countryId, prefix, prefix),
    env.DB.prepare(
      `INSERT INTO products(id,country_id,product_family_id,name,slug,created_at,updated_at) ${series} SELECT ?||i,?,'line-'||?||i,'Batch product '||i,?||i,1,1 FROM n`,
    ).bind(prefix, f.countryId, prefix, prefix),
    env.DB.prepare(
      `INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) ${series} SELECT 'v-'||?||i,?||i,1,1,1 FROM n`,
    ).bind(prefix, prefix),
    env.DB.prepare(
      `INSERT INTO product_categories(product_id,category_id,created_at,updated_at) ${series} SELECT ?||i,?,1,1 FROM n`,
    ).bind(prefix, category),
    env.DB.prepare(
      `INSERT INTO family_category_stats(product_family_id,category_id,people_count,mean_sum,raw_average,bayesian_score,enjoyment_people,enjoyment_mean_sum,enjoyment_score,lead_product_id,recomputed_at) ${series} SELECT 'line-'||?||i,?,1,4,4,4.9-i*0.001,CASE WHEN i<=22 THEN 1 ELSE 0 END,CASE WHEN i<=22 THEN 4 ELSE 0 END,CASE WHEN i<=22 THEN 4.9-i*0.001 ELSE NULL END,?||i,1 FROM n`,
    ).bind(prefix, category, prefix),
    // FTS is a rebuildable projection, updated explicitly by application writes.
    env.DB.prepare(
      `INSERT INTO search_index(entity_type,entity_id,country_code,title,aliases,subtitle,body) ${series} SELECT 'product',?||i,'US','Batch product '||i,'','','' FROM n`,
    ).bind(prefix),
  ]);
  const repository = new D1CatalogRepository(env.DB);
  const catalog = new CatalogService(repository);
  const market = testMarket(f.countryId);
  const cards = vi.spyOn(repository, "rankedCards");
  const flavors = vi.spyOn(repository, "flavors");
  const taxonomy = vi.spyOn(repository, "taxonomy");
  const unranked = vi.spyOn(repository, "unranked");
  const rows = [];
  let cursor: string | null = null;
  let boundaries = 0;
  do {
    const part: Awaited<
      ReturnType<typeof catalog.category>
    >["batches"]["ranked"] = await catalog.categoryBatch(
      market,
      category,
      { view: "tastiest" },
      "ranked",
      cursor,
    );
    expect(part.items.length).toBeLessThanOrEqual(20);
    expect(cards.mock.calls.at(-1)![2].length).toBeLessThanOrEqual(20);
    expect(flavors.mock.calls.at(-1)![2].length).toBeLessThanOrEqual(20);
    expect(Object.keys(part).sort()).toEqual([
      "boundaryId",
      "items",
      "limitReached",
      "nextCursor",
      "start",
    ]);
    boundaries += part.items.filter(
      (row) => row.lineId === part.boundaryId,
    ).length;
    rows.push(...part.items);
    cursor = part.nextCursor;
  } while (cursor);
  expect(rows).toHaveLength(65);
  expect(new Set(rows.map((row) => row.lineId)).size).toBe(65);
  expect(rows.map((row) => row.closestRank)).toEqual(
    Array.from({ length: 65 }, (_, i) => i + 1),
  );
  expect(boundaries).toBe(1);
  expect(taxonomy).not.toHaveBeenCalled();
  expect(unranked).not.toHaveBeenCalled();
  const first = await catalog.categoryBatch(market, category, {}, "ranked");
  await expect(
    catalog.categoryBatch(
      market,
      category,
      { view: "new" },
      "ranked",
      first.nextCursor,
    ),
  ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  await expect(
    catalog.categoryBatch(market, category, {}, "unranked", first.nextCursor),
  ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  // Stable FTS sort keys continue past identical ranking scores and names.
  const products = [];
  cursor = null;
  do {
    const part: Awaited<
      ReturnType<typeof catalog.searchResults>
    >["batches"]["products"] = await catalog.searchBatch(
      market,
      "Batch",
      "products",
      cursor,
    );
    expect(part.items.length).toBeLessThanOrEqual(20);
    products.push(...part.items);
    cursor = part.nextCursor;
  } while (cursor);
  expect(products).toHaveLength(65);
  expect(new Set(products.map((row) => row.id)).size).toBe(65);
  expect(taxonomy).not.toHaveBeenCalled();
  // A new lead flavor between ordering and hydration must not detach the
  // line's Tastiest rank from its card.
  const hydrate = D1CatalogRepository.prototype.rankedCards.bind(repository);
  cards.mockImplementationOnce(async (...args) =>
    (await hydrate(...args)).map((row) => ({
      ...row,
      id: `new-lead-${row.id}`,
    })),
  );
  const changedLead = await catalog.categoryBatch(
    market,
    category,
    { view: "tastiest" },
    "ranked",
  );
  expect(changedLead.items[0]!.leadProduct.id).toContain("new-lead-");
  expect(changedLead.items[0]!.tastiestRank).toBe(1);
  vi.restoreAllMocks();
});
