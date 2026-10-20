import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import {
  matchingBrands,
  matchingBrandResults,
} from "../../server/catalog/infrastructure/brand-rows";
import { rebuildSearchIndex } from "../../server/catalog/infrastructure/search-index";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { catalogFixture, testMarket } from "./fixtures";

const db = env.DB;
const found = async (query: string) =>
  (await matchingBrands(db, "none", query, 10, { everyBrand: true })).map(
    (brand) => [brand.name, brand.aliases],
  );
const indexed = async () =>
  (
    await db
      .prepare(
        "SELECT brand_id,aliases,names FROM brand_search ORDER BY brand_id",
      )
      .all()
  ).results;

it("keeps the brand index current through brand and alias writes", async () => {
  const s = crypto.randomUUID().slice(0, 6);
  const id = `brand-${s}`,
    name = `Kitehill${s}`;
  await db
    .prepare(
      "INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    )
    .bind(id, name, name.toLowerCase(), id)
    .run();
  // A word's start, part of the name and a couple of typos.
  expect(await found(`kitehill${s}`)).toEqual([[name, []]]);
  expect(await found(`hill${s}`)).toEqual([[name, []]]);
  expect(await found(`kiteil${s}`)).toEqual([[name, []]]);
  // Fewer than three letters in a row look nothing up.
  expect(await found("ki")).toEqual([]);
  // A swap in a short name leaves no trigram ("Dayia" for "Daiya"); brands
  // with the same first letter still reach the matcher.
  const letters = [..."bcdfghjklmnpqrstvwxz"]
    .sort(() => Math.random() - 0.5)
    .slice(0, 5);
  const short = letters.join("");
  const swapped = [
    letters[0],
    letters[2],
    letters[1],
    ...letters.slice(3),
  ].join("");
  await db
    .prepare(
      "INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    )
    .bind(`short-${s}`, short, short, `short-${s}`)
    .run();
  expect(await found(swapped)).toContainEqual([short, []]);

  const alias = `Hillside${s}`;
  await db
    .prepare(
      "INSERT INTO brand_aliases(normalized_name,alias,brand_id) VALUES(?,?,?)",
    )
    .bind(alias.toLowerCase(), alias, id)
    .run();
  expect(await found(`hillside${s}`)).toEqual([[name, [alias]]]);

  const renamed = `Meadow${s}`;
  await db
    .prepare("UPDATE brands SET name=? WHERE id=?")
    .bind(renamed, id)
    .run();
  expect(await found(`kitehill${s}`)).toEqual([]);
  expect(await found(`meadow${s}`)).toEqual([[renamed, [alias]]]);

  await db.prepare("DELETE FROM brand_aliases WHERE brand_id=?").bind(id).run();
  expect(await found(`hillside${s}`)).toEqual([]);

  // A rebuild writes exactly what the triggers kept.
  const kept = await indexed();
  await rebuildSearchIndex(db);
  expect(await indexed()).toEqual(kept);
});

async function brandFixture(count: number, name = "Qzx") {
  const fixture = await catalogFixture(db, 0);
  const prefix = `brand-page-${crypto.randomUUID()}-`;
  const title = `${name}${count}-`;
  const series = `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<${count})`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) ${series} SELECT ?||i,?||printf('%03d',i),lower(?)||printf('%03d',i),?||i,1,1 FROM n`,
      )
      .bind(prefix, title, title, prefix),
    db
      .prepare(
        `INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at) ${series} SELECT ?||i,?||i,?,'Product '||i,?||i,1,1 FROM n`,
      )
      .bind(prefix, prefix, fixture.countryId, prefix),
    db
      .prepare(
        `INSERT INTO products(id,country_id,brand_id,product_family_id,name,slug,created_at,updated_at) ${series} SELECT ?||i,?,?||i,?||i,'Product '||i,?||i,1,1 FROM n`,
      )
      .bind(prefix, fixture.countryId, prefix, prefix, prefix),
  ]);
  return testMarket(fixture.countryId);
}

it.each([200, 210])(
  "distinguishes exhaustion from a truncated %i-brand search",
  async (count) => {
    const market = await brandFixture(count);
    const catalog = new CatalogService(new D1CatalogRepository(db));
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const batch: Awaited<
        ReturnType<typeof catalog.searchResults>
      >["batches"]["brands"] = await catalog.searchBatch(
        market,
        "qzx",
        "brands",
        cursor,
      );
      expect(batch.items).toHaveLength(10);
      expect(batch.start).toBe(ids.length);
      ids.push(...batch.items.map((item) => item.id));
      cursor = batch.nextCursor;
      expect(batch.limitReached).toBe(!cursor && count > 200);
      expect(ids.length).toBeLessThanOrEqual(200);
    } while (cursor);
    expect(ids).toHaveLength(200);
    expect(new Set(ids).size).toBe(200);
    // Legacy reads and instant answers still expose arrays of brands.
    expect((await catalog.search(market, "qzx")).brands).toHaveLength(10);
    expect((await catalog.suggest(market, "qzx")).brands).toHaveLength(3);
    if (count > 200) {
      // Candidate truncation must remain visible even if none of the candidates
      // pass the final matcher; the page must not declare "no matches".
      const noMatches = await catalog.searchBatch(market, "qzxt", "brands");
      expect(noMatches).toMatchObject({
        items: [],
        nextCursor: null,
        limitReached: true,
      });
    }
  },
);

it("detects the typo candidate limit when there are no shared trigrams", async () => {
  const market = await brandFixture(2001, "Daiya");
  const result = await matchingBrandResults(db, market.id, "Dayia", 11);
  expect(result.items).toHaveLength(11);
  expect(result.truncated).toBe(true);
});
