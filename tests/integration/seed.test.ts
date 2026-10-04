import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import {
  developmentSeedStatements,
  seedId,
  seedSql,
} from "../../db/seed/statements";
import { seedCategories, seedProducts } from "../../db/seed/catalog";

it("seeds all ten US categories repeatably without identities, ratings, or formula claims", async () => {
  const statements = developmentSeedStatements("test");
  for (let run = 0; run < 2; run++) {
    for (let offset = 0; offset < statements.length; offset += 50) {
      await env.DB.batch(
        statements
          .slice(offset, offset + 50)
          .map((statement) =>
            env.DB.prepare(statement.sql).bind(...statement.params),
          ),
      );
    }
  }
  for (const category of seedCategories) {
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM product_categories pc JOIN products p ON p.id=pc.product_id WHERE pc.category_id=? AND p.development_only=1",
    )
      .bind(seedId(`category:${category.slug}`))
      .first<number>("count");
    expect(count).toBeGreaterThanOrEqual(3);
  }
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM products WHERE development_only=1 AND country_id=?",
    )
      .bind(seedId("country:US"))
      .first("count"),
  ).toBe(seedProducts.length);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM search_index WHERE body LIKE 'Development record:%'",
    ).first("count"),
  ).toBe(seedProducts.length);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM product_versions WHERE product_id=?",
    )
      .bind(seedId("product:beyond-beef"))
      .first("count"),
  ).toBe(2);
  expect(await env.DB.prepare("PRAGMA foreign_key_check").all()).toMatchObject({
    results: [],
  });
  expect(() => developmentSeedStatements("production")).toThrow(
    "Development seeds",
  );
  expect(seedSql([{ sql: "SELECT ?", params: ["Upton's"] }])).toBe(
    "SELECT 'Upton''s';",
  );
  expect(
    statements.some((statement) =>
      /insert into "(user|profiles|ratings)"/i.test(statement.sql),
    ),
  ).toBe(false);
});
