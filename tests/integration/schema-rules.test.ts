import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import {
  TAXONOMY_GROUPS,
  TAXONOMY_LEAVES,
  taxonomySeedStatements,
} from "../../db/seed/taxonomy";

const id = () => crypto.randomUUID();
const countries = (db: D1Database, categoryId: string) =>
  db
    .prepare(
      "SELECT country_id AS country,source FROM category_countries WHERE category_id=? ORDER BY country_id",
    )
    .bind(categoryId)
    .all<{ country: string; source: string }>()
    .then((r) => r.results);

// Food availability rules the schema enforces on its own (milestone 6).
it("switches foods on where their products are, guards availability and the unchecked flag", async () => {
  const db = env.DB;
  const f = await catalogFixture(db, 2);
  const [food] = f.categories as [string, string];
  const aisle = `aisle-${id()}`,
    retired = `retired-${id()}`,
    hidden = `hidden-${id()}`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO categories(id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,0,1,1)",
      )
      .bind(aisle, aisle, "Aisle"),
    // A retired food still follows its visible product.
    db
      .prepare(
        "INSERT INTO categories(id,slug,name,is_rankable,is_active,created_at,updated_at) VALUES(?,?,?,1,0,1,1)",
      )
      .bind(retired, retired, "Retired food"),
    db
      .prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
      )
      .bind(f.productId, retired),
    // A hidden product switches nothing on.
    db
      .prepare(
        "INSERT INTO products(id,country_id,name,slug,lifecycle_status,created_at,updated_at) VALUES(?,?,?,?,'hidden',1,1)",
      )
      .bind(hidden, f.otherCountryId, "Hidden", hidden),
    db
      .prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
      )
      .bind(hidden, food),
    db
      .prepare(
        "INSERT INTO formula_classifications(product_version_id,vegan_status,manufacturer_label,evidence_data,updated_at) VALUES(?,'vegan','vegan',?,1)",
      )
      .bind(
        f.versionId,
        JSON.stringify({ urls: [], imageIds: [], note: "Checked evidence." }),
      ),
  ]);
  expect(await countries(db, food)).toEqual([
    { country: f.countryId, source: "product" },
  ]);
  expect(await countries(db, retired)).toEqual([
    { country: f.countryId, source: "product" },
  ]);
  expect(await countries(db, aisle)).toEqual([]);
  // Classifications are checked unless written otherwise.
  expect(
    await db
      .prepare(
        "SELECT ingredients_checked FROM formula_classifications WHERE product_version_id=?",
      )
      .bind(f.versionId)
      .first("ingredients_checked"),
  ).toBe(1);

  // Aisles are never country-scoped.
  await expect(
    db
      .prepare(
        "INSERT INTO category_countries(category_id,country_id,source,created_at) VALUES(?,?,'operator',1)",
      )
      .bind(aisle, f.countryId)
      .run(),
  ).rejects.toThrow(/only foods/);
  // A food with a visible product stays on in that country.
  await expect(
    db
      .prepare(
        "DELETE FROM category_countries WHERE category_id=? AND country_id=?",
      )
      .bind(food, f.countryId)
      .run(),
  ).rejects.toThrow(/stays on/);

  // A membership in a new country switches the food on there, once.
  const elsewhere = `elsewhere-${id()}`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO products(id,country_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      )
      .bind(elsewhere, f.otherCountryId, "Elsewhere", elsewhere),
    db
      .prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
      )
      .bind(elsewhere, food),
  ]);
  expect(await countries(db, food)).toContainEqual({
    country: f.otherCountryId,
    source: "product",
  });

  // Hiding the product lets an operator switch the food off; restoring it
  // switches the food back on.
  await db
    .prepare("UPDATE products SET lifecycle_status='hidden' WHERE id=?")
    .bind(elsewhere)
    .run();
  await db
    .prepare(
      "DELETE FROM category_countries WHERE category_id=? AND country_id=?",
    )
    .bind(food, f.otherCountryId)
    .run();
  expect((await countries(db, food)).map((r) => r.country)).not.toContain(
    f.otherCountryId,
  );
  await db
    .prepare("UPDATE products SET lifecycle_status='active' WHERE id=?")
    .bind(elsewhere)
    .run();
  expect((await countries(db, food)).map((r) => r.country)).toContain(
    f.otherCountryId,
  );

  // An unchecked formula can only carry the appears_vegan placeholder.
  await expect(
    db
      .prepare(
        "UPDATE formula_classifications SET ingredients_checked=0 WHERE product_version_id=?",
      )
      .bind(f.versionId)
      .run(),
  ).rejects.toThrow(/CHECK/);
  await db
    .prepare(
      "UPDATE formula_classifications SET vegan_status='appears_vegan',ingredients_checked=0 WHERE product_version_id=?",
    )
    .bind(f.versionId)
    .run();
  await expect(
    db
      .prepare(
        "UPDATE formula_classifications SET vegan_status='under_review' WHERE product_version_id=?",
      )
      .bind(f.versionId)
      .run(),
  ).rejects.toThrow(/CHECK/);
});

it("seeds each launch food in its launch countries without undoing an operator's change", async () => {
  const seed = () =>
    env.DB.batch(
      taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
    );
  await seed();
  const launch = (
    await env.DB.prepare(
      "SELECT c.slug,COUNT(cc.country_id) AS n FROM categories c JOIN category_countries cc ON cc.category_id=c.id JOIN countries co ON co.id=cc.country_id WHERE co.iso2 IN ('US','CA','GB','AU','NZ','IE') AND c.slug IN (SELECT value FROM json_each(?)) GROUP BY c.slug",
    )
      .bind(JSON.stringify(TAXONOMY_LEAVES.map((l) => l.slug)))
      .all<{ slug: string; n: number }>()
  ).results;
  expect(launch).toHaveLength(TAXONOMY_LEAVES.length);
  // The ten launch foods are on everywhere; the United States launch foods
  // (milestone 7) start only there.
  const expected = new Map<string, number>(
    TAXONOMY_LEAVES.map((leaf) => [
      leaf.slug,
      "countries" in leaf ? leaf.countries.length : 6,
    ]),
  );
  expect(launch.every((r) => r.n === expected.get(r.slug))).toBe(true);
  expect(launch.filter((r) => r.n === 6)).toHaveLength(10);
  // An operator switched Bacon off in New Zealand: reseeding keeps it off.
  const bacon = (await env.DB.prepare(
    "SELECT id FROM categories WHERE slug='bacon'",
  ).first("id")) as string;
  const nz = (await env.DB.prepare(
    "SELECT id FROM countries WHERE iso2='NZ'",
  ).first("id")) as string;
  const operator = `operator-${id()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
    ).bind(operator, "Operator", `${operator}@example.invalid`),
    env.DB.prepare(
      "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(operator, operator),
    env.DB.prepare(
      "DELETE FROM category_countries WHERE category_id=? AND country_id=?",
    ).bind(bacon, nz),
    env.DB.prepare(
      "INSERT INTO moderation_actions(id,actor_id,kind,target_id,before_data,after_data,note,created_at) VALUES(?,?,'category_countries',?,'{}','{}','Not sold in New Zealand.',1)",
    ).bind(id(), operator, bacon),
  ]);
  await seed();
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM category_countries WHERE category_id=? AND country_id=?",
    )
      .bind(bacon, nz)
      .first("n"),
  ).toBe(0);
  // The 18 aisles sit directly under Food and are never country-scoped.
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM categories c JOIN categories p ON p.id=c.parent_id AND p.slug='food' WHERE c.is_rankable=0 AND c.slug IN (SELECT value FROM json_each(?))",
    )
      .bind(
        JSON.stringify(
          TAXONOMY_GROUPS.filter((g) => g.parent === "food").map((g) => g.slug),
        ),
      )
      .first("n"),
  ).toBe(18);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM category_countries cc JOIN categories c ON c.id=cc.category_id WHERE c.is_rankable=0",
    ).first("n"),
  ).toBe(0);
});
