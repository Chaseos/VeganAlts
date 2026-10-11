import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import {
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

// A milestone 5 database (through 0018) upgraded through 0019–0020.
it("backfills food availability, enforces its invariants and adds the unchecked flag", async () => {
  const db = env.DB_UPGRADE;
  await applyD1Migrations(
    db,
    env.TEST_MIGRATIONS.filter((m) => Number(m.name.slice(0, 4)) < 19),
  );
  const f = await catalogFixture(db, 2);
  const [food] = f.categories as [string, string];
  const shelf = `shelf-${id()}`,
    retired = `retired-${id()}`,
    closed = `closed-${id()}`,
    hidden = `hidden-${id()}`;
  await db.batch([
    db
      .prepare(
        "INSERT INTO categories(id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,0,1,1)",
      )
      .bind(shelf, shelf, "Shelf"),
    // A retired food still listed for its visible product's country.
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
    db
      .prepare(
        "INSERT INTO countries(id,iso2,name,is_active,created_at,updated_at) VALUES(?,?,?,0,1,1)",
      )
      .bind(closed, `ZZ-${closed}`, "Closed"),
    db
      .prepare(
        "INSERT INTO products(id,country_id,name,slug,lifecycle_status,created_at,updated_at) VALUES(?,?,?,?,'hidden',1,1)",
      )
      .bind(hidden, closed, "Hidden", hidden),
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
        JSON.stringify({ urls: [], imageIds: [], note: "Legacy evidence." }),
      ),
  ]);

  await applyD1Migrations(db, env.TEST_MIGRATIONS);

  // Active foods are on in every active country; a closed country, a group or
  // a hidden product adds nothing, and a retired food follows its product.
  const active = (
    await db
      .prepare("SELECT id FROM countries WHERE is_active=1 ORDER BY id")
      .all<{ id: string }>()
  ).results.map((r) => r.id);
  expect((await countries(db, food)).map((r) => r.country)).toEqual(active);
  expect(await countries(db, shelf)).toEqual([]);
  expect(await countries(db, retired)).toEqual([
    { country: f.countryId, source: "product" },
  ]);
  expect(
    await db
      .prepare(
        "SELECT ingredients_checked FROM formula_classifications WHERE product_version_id=?",
      )
      .bind(f.versionId)
      .first("ingredients_checked"),
  ).toBe(1);

  // Aisles and shelves are never country-scoped.
  await expect(
    db
      .prepare(
        "INSERT INTO category_countries(category_id,country_id,source,created_at) VALUES(?,?,'operator',1)",
      )
      .bind(shelf, f.countryId)
      .run(),
  ).rejects.toThrow(/only foods/);
  // A food with a visible product stays on in that country.
  const off = db
    .prepare(
      "DELETE FROM category_countries WHERE category_id=? AND country_id=?",
    )
    .bind(food, f.countryId);
  await expect(off.run()).rejects.toThrow(/stays on/);
  await db
    .prepare(
      "DELETE FROM category_countries WHERE category_id=? AND country_id=?",
    )
    .bind(food, f.otherCountryId)
    .run();

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
  expect(
    (
      await db
        .prepare("SELECT name FROM pragma_table_info('pending_submissions')")
        .all<{ name: string }>()
    ).results.map((r) => r.name),
  ).toContain("category_proposal_id");
});

it("seeds launch foods in every launch country without undoing an operator's change", async () => {
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
  expect(launch.every((r) => r.n === 6)).toBe(true);
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
  // The starter shelves exist and are never country-scoped.
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM categories c JOIN categories p ON p.id=c.parent_id WHERE c.slug IN ('turkey-shelf','lamb-shelf','fish-shelf','shellfish-shelf','cream-shelf','yogurt-shelf','ice-cream-shelf','hard-and-grated') AND c.is_rankable=0",
    ).first("n"),
  ).toBe(8);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM category_countries cc JOIN categories c ON c.id=cc.category_id WHERE c.is_rankable=0",
    ).first("n"),
  ).toBe(0);
});
