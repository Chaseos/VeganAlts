import { withLocalDb } from "./local-db";

export async function removeBrowseFixture() {
  await withLocalDb(async (db) => {
    await db.batch([
      db.prepare("DELETE FROM search_index WHERE entity_id LIKE 'browse-%'"),
      db.prepare("DELETE FROM products WHERE id LIKE 'browse-%'"),
      db.prepare("DELETE FROM product_families WHERE id LIKE 'browse-line-%'"),
      db.prepare("DELETE FROM brands WHERE id LIKE 'browse-brand-%'"),
      db.prepare("DELETE FROM categories WHERE id LIKE 'browse-food%'"),
    ]);
  });
}

/** Fictional large catalog, exclusively in the local browser harness. */
export async function prepareBrowseFixture() {
  await withLocalDb(async (db) => {
    if (
      await db
        .prepare("SELECT id FROM categories WHERE id='browse-food'")
        .first()
    ) {
      // Account cleanup rebuilds aggregates. Restore only these fictional
      // standings before the next browser project's public journeys.
      const i = "CAST(replace(product_family_id,'browse-line-','') AS INTEGER)";
      await db
        .prepare(
          `UPDATE family_category_stats SET people_count=CASE WHEN ${i}<=240 THEN 10 ELSE 0 END,mean_sum=CASE WHEN ${i}<=240 THEN 40 ELSE 0 END,raw_average=CASE WHEN ${i}<=240 THEN 4 ELSE NULL END,bayesian_score=CASE WHEN ${i}<=240 THEN 4.9-${i}*0.001 ELSE NULL END,enjoyment_people=CASE WHEN ${i}<=22 THEN 10 ELSE 0 END,enjoyment_mean_sum=CASE WHEN ${i}<=22 THEN 40 ELSE 0 END,enjoyment_score=CASE WHEN ${i}<=22 THEN 4.9-${i}*0.001 ELSE NULL END WHERE category_id='browse-food'`,
        )
        .run();
      return;
    }
    const country = await db
      .prepare("SELECT id FROM countries WHERE iso2='US'")
      .first<{ id: string }>();
    const aisle = await db
      .prepare("SELECT id FROM categories WHERE slug='beef'")
      .first<{ id: string }>();
    if (!country || !aisle)
      throw new Error("Prepare the demo browser catalog first.");
    const series = (count: number) =>
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<${count})`;
    await db.batch([
      db
        .prepare(
          "INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at) VALUES('browse-food',?,'browse-batches','Appendfixture food',1,1,1)",
        )
        .bind(aisle.id),
      db
        .prepare(
          `INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at) ${series(26)} SELECT 'browse-food-'||i,?,'browse-food-'||i,'Appendfixture food '||i,1,1,1 FROM n`,
        )
        .bind(aisle.id),
      db
        .prepare(
          `INSERT INTO category_countries(country_id,category_id,source,created_at) SELECT ?,id,'operator',1 FROM categories WHERE id LIKE 'browse-food%'`,
        )
        .bind(country.id),
      db.prepare(
        `INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) ${series(27)} SELECT 'browse-brand-'||i,'Appendfixture brand '||i,'appendfixture brand '||i,'browse-brand-'||i,1,1 FROM n`,
      ),
      db
        .prepare(
          `INSERT INTO product_families(id,brand_id,country_id,canonical_name,slug,created_at,updated_at) ${series(285)} SELECT 'browse-line-'||i,'browse-brand-'||((i-1)%27+1),?,'Appendfixture product '||printf('%03d',i),'browse-line-'||i,1,1 FROM n`,
        )
        .bind(country.id),
      db
        .prepare(
          `INSERT INTO products(id,country_id,brand_id,product_family_id,name,slug,created_at,updated_at) ${series(285)} SELECT 'browse-product-'||i,?,'browse-brand-'||((i-1)%27+1),'browse-line-'||i,'Appendfixture product '||printf('%03d',i),'browse-product-'||i,1,1 FROM n`,
        )
        .bind(country.id),
      db.prepare(
        `INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) ${series(285)} SELECT 'browse-version-'||i,'browse-product-'||i,1,1,1 FROM n`,
      ),
      db.prepare(
        `INSERT INTO product_categories(product_id,category_id,created_at,updated_at) ${series(285)} SELECT 'browse-product-'||i,'browse-food',1,1 FROM n`,
      ),
      db.prepare(
        `INSERT INTO family_category_stats(product_family_id,category_id,people_count,mean_sum,raw_average,bayesian_score,enjoyment_people,enjoyment_mean_sum,enjoyment_score,lead_product_id,recomputed_at) ${series(285)} SELECT 'browse-line-'||i,'browse-food',CASE WHEN i<=240 THEN 10 ELSE 0 END,CASE WHEN i<=240 THEN 40 ELSE 0 END,CASE WHEN i<=240 THEN 4 ELSE NULL END,CASE WHEN i<=240 THEN 4.9-i*0.001 ELSE NULL END,CASE WHEN i<=22 THEN 10 ELSE 0 END,CASE WHEN i<=22 THEN 40 ELSE 0 END,CASE WHEN i<=22 THEN 4.9-i*0.001 ELSE NULL END,'browse-product-'||i,1 FROM n`,
      ),
      db
        .prepare(
          "INSERT INTO products(id,country_id,brand_id,product_family_id,name,slug,flavor,created_at,updated_at) VALUES('browse-flavor',?,'browse-brand-1','browse-line-1','Appendfixture product Berry','browse-flavor','Berry',1,1)",
        )
        .bind(country.id),
      db.prepare(
        "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES('browse-flavor-version','browse-flavor',1,1,1)",
      ),
      db.prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES('browse-flavor','browse-food',1,1)",
      ),
      db.prepare(
        "INSERT INTO search_index(entity_type,entity_id,country_code,title,subtitle,aliases,body) SELECT 'product',id,'US',name,'','','' FROM products WHERE id LIKE 'browse-%'",
      ),
      db.prepare(
        "INSERT INTO search_index(entity_type,entity_id,country_code,title,subtitle,aliases,body) SELECT 'category',id,'US',name,'','','' FROM categories WHERE id LIKE 'browse-food%'",
      ),
    ]);
  });
}
