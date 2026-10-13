import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { matchingBrands } from "../../server/catalog/infrastructure/brand-rows";
import { rebuildSearchIndex } from "../../server/catalog/infrastructure/search-index";

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
