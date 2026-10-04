import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { catalogFixture } from "./fixtures";

describe("D1 migrations and relational invariants", () => {
  it("enforces auth linkage, case-insensitive handles and exactly one current formula", async () => {
    const fixture = await catalogFixture(env.DB);
    await expect(
      env.DB.prepare(
        "INSERT INTO profiles (user_id,handle,created_at,updated_at) VALUES ('missing','missing',1,1)",
      ).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
    await expect(
      env.DB.prepare("UPDATE profiles SET handle = ? WHERE user_id = ?")
        .bind(fixture.users[0]!.id.toUpperCase(), fixture.users[1]!.id)
        .run(),
    ).rejects.toThrow(/UNIQUE/);
    await expect(
      env.DB.prepare(
        "INSERT INTO product_versions (id,product_id,is_current,created_at,updated_at) VALUES ('duplicate-current',?,1,1,1)",
      )
        .bind(fixture.productId)
        .run(),
    ).rejects.toThrow(/UNIQUE/);
    expect(
      (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
  });
  it("rejects fractional scores, duplicate ratings and unrelated categories", async () => {
    const f = await catalogFixture(env.DB);
    const insert = (id: string, score: number, category = f.categories[0]!) =>
      env.DB.prepare(
        `INSERT INTO ratings
      (id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES (?,?,?,?,?,1,1)`,
      )
        .bind(id, f.users[0]!.id, f.versionId, category, score)
        .run();
    await expect(insert("fractional", 2.5)).rejects.toThrow(/CHECK/);
    await expect(insert("unrelated", 3, "missing-category")).rejects.toThrow(
      /does not belong/,
    );
    await insert(`rating-${f.versionId}`, 4);
    await expect(insert("duplicate", 3)).rejects.toThrow(/UNIQUE/);
  });
  it("handles global alias uniqueness and supports the FTS5 index", async () => {
    const f = await catalogFixture(env.DB);
    await env.DB.prepare(
      "INSERT INTO category_aliases (id,category_id,alias,created_at) VALUES (?,?,?,1)",
    )
      .bind(`alias-${f.versionId}`, f.categories[0], "Minced beef")
      .run();
    await expect(
      env.DB.prepare(
        "INSERT INTO category_aliases (id,category_id,alias,created_at) VALUES (?,?,?,1)",
      )
        .bind("duplicate-alias", f.categories[0], "MINCED BEEF")
        .run(),
    ).rejects.toThrow(/UNIQUE/);
    await env.DB.prepare(
      "INSERT INTO search_index (entity_type,entity_id,country_code,title) VALUES ('product',?,'US','Vegan burger')",
    )
      .bind(f.productId)
      .run();
    const result = await env.DB.prepare(
      "SELECT entity_id FROM search_index WHERE search_index MATCH 'burger' AND entity_id = ?",
    )
      .bind(f.productId)
      .first();
    expect(result?.entity_id).toBe(f.productId);
  });
});
