import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";

it("upgrades milestone 2 with durable history and backfills only current formula classifications", async () => {
  const old = env.TEST_MIGRATIONS.filter((m) => Number(m.name.slice(0, 4)) < 6),
    db = env.DB_UPGRADE;
  await applyD1Migrations(db, old);
  const f = await catalogFixture(db, 1),
    historical = crypto.randomUUID(),
    rating = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,0,1,1)",
      )
      .bind(historical, f.productId),
    db
      .prepare(
        "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,5,1,1)",
      )
      .bind(rating, f.users[0]!.id, historical, f.categories[0]),
    db
      .prepare("UPDATE products SET vegan_status='under_review' WHERE id=?")
      .bind(f.productId),
  ]);
  const before = await db
    .prepare("SELECT * FROM ratings WHERE id=?")
    .bind(rating)
    .first();
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  expect(
    await db.prepare("SELECT * FROM ratings WHERE id=?").bind(rating).first(),
  ).toEqual(before);
  expect(
    await db
      .prepare(
        "SELECT vegan_status FROM formula_classifications WHERE product_version_id=?",
      )
      .bind(f.versionId)
      .first("vegan_status"),
  ).toBe("under_review");
  expect(
    await db
      .prepare(
        "SELECT * FROM formula_classifications WHERE product_version_id=?",
      )
      .bind(historical)
      .first(),
  ).toBeNull();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
  expect(
    await db
      .prepare("SELECT COUNT(*) n FROM product_versions WHERE product_id=?")
      .bind(f.productId)
      .first("n"),
  ).toBe(2);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});
