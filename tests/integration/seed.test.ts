import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import {
  developmentSeedStatements,
  seedId,
  seedSql,
} from "../../db/seed/statements";
import {
  DEVELOPMENT_NOTICE,
  seedCategories,
  seedProducts,
} from "../../db/seed/catalog";
import { communityServices } from "../../server/community/infrastructure/composition";
import { changeInput } from "../../server/community/domain/contracts";

it("seeds approved demonstration data repeatably without changing real contributions", async () => {
  const statements = developmentSeedStatements("test");
  let initialNotes: { slug: string; dataNotes: string }[] | undefined;
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
    const { results: notes } = await env.DB.prepare(
      "SELECT slug,data_notes AS dataNotes FROM products WHERE development_only=1 ORDER BY slug",
    ).all<{ slug: string; dataNotes: string }>();
    if (initialNotes) expect(notes).toEqual(initialNotes);
    else initialNotes = notes;
    for (const product of seedProducts) {
      const dataNotes = notes.find(
        (row) => row.slug === product.slug,
      )!.dataNotes;
      expect(dataNotes).toContain(DEVELOPMENT_NOTICE);
      if (product.notes) expect(dataNotes).toContain(product.notes);
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
      "SELECT COUNT(*) AS count FROM search_index WHERE entity_type='product' AND country_code='US'",
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
  ).toBe(true);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM profiles WHERE handle LIKE 'demo_taster_%'",
    ).first("count"),
  ).toBe(28);
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS count FROM ratings").first<number>(
      "count",
    ),
  ).toBeGreaterThan(100);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM products WHERE development_only=1 AND vegan_status='under_review'",
    ).first("count"),
  ).toBe(0);
});

it("preserves accepted moderation, current formula changes, and real ratings when reseeded", async () => {
  const seed = async () => {
    const statements = developmentSeedStatements("test");
    for (let i = 0; i < statements.length; i += 50)
      await env.DB.batch(
        statements
          .slice(i, i + 50)
          .map((s) => env.DB.prepare(s.sql).bind(...s.params)),
      );
  };
  await seed();
  const id = () => crypto.randomUUID(),
    services = communityServices(env, id),
    productId = seedId("product:beyond-burger"),
    userId = id(),
    admin = {
      id: seedId("taster:0"),
      accountState: "active",
      administrator: true,
    };
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
    ).bind(userId, "Real contribution fixture", `${userId}@example.invalid`),
    env.DB.prepare(
      "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(userId, userId),
  ]);
  const before = await services.repository.snapshot(productId);
  const proposal = await services.contributions.propose(
    admin,
    id(),
    changeInput.parse({
      kind: "reformulation",
      productId,
      expectedRevision: before.revision,
      versionLabel: "Operator-accepted replacement",
      effectiveDate: "2026-09",
      veganStatus: "under_review",
      manufacturerLabel: "plant_based",
      evidence: {
        urls: ["https://example.com/recipe"],
        note: "Current ingredients require operator follow-up before ratings resume.",
      },
    }),
  );
  await services.moderation.decide(admin, id(), "proposal", proposal.id, {
    decision: "accept",
    expectedRevision: (await services.repository.proposal(proposal.id))!
      .updated_at,
    effect: "none",
    note: "Manufacturer recipe evidence reviewed and history preserved.",
  });
  const approved = await services.repository.snapshot(productId),
    ratingId = id();
  await env.DB.prepare(
    "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,3,2,2)",
  )
    .bind(ratingId, userId, before.versionId, before.categories[0]!.categoryId)
    .run();
  const rating = await env.DB.prepare("SELECT * FROM ratings WHERE id=?")
    .bind(ratingId)
    .first();
  const actions = await services.repository.actions(productId);
  await seed();
  expect(await services.repository.snapshot(productId)).toEqual(approved);
  expect(
    await env.DB.prepare("SELECT * FROM ratings WHERE id=?")
      .bind(ratingId)
      .first(),
  ).toEqual(rating);
  expect(await services.repository.actions(productId)).toEqual(actions);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});
