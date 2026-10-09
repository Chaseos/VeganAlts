import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { TaxonomyService } from "../../server/taxonomy/application/taxonomy-service";
import { reshapeTaxonomy } from "../../server/taxonomy/application/reshape";
import { D1TaxonomyRepository } from "../../server/taxonomy/infrastructure/d1-taxonomy-repository";
import { ModerationRepository } from "../../server/community/infrastructure/moderation-repository";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { rebuildSearchIndex } from "../../server/catalog/infrastructure/search-index";
import type { ModerationDecisionService } from "../../server/moderation/application/decision-service";
import {
  TAXONOMY_GROUPS,
  TAXONOMY_LEAVES,
  taxonomySeedStatements,
} from "../../db/seed/taxonomy";

const id = () => crypto.randomUUID();

// A milestone 4 database (migrations through 0015) with a completed category
// merge, upgraded through 0016–0018, then seeded and reshaped as staging is.
it("upgrades milestone 4 data, keeps its merge ledger reversible and reshapes the taxonomy", async () => {
  const db = env.DB_UPGRADE;
  await applyD1Migrations(
    db,
    env.TEST_MIGRATIONS.filter((m) => Number(m.name.slice(0, 4)) < 16),
  );
  const f = await catalogFixture(db, 3);
  await db
    .prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const [survivor, burgers] = f.categories as [string, string];
  const donor = `minced-${id().slice(0, 6)}`,
    mergeId = id(),
    actionId = id(),
    moved = `moved-${id().slice(0, 6)}`,
    stay = `stay-${id().slice(0, 6)}`;
  const [a, b, c] = f.users as [
    (typeof f.users)[0],
    (typeof f.users)[0],
    (typeof f.users)[0],
  ];
  await db.batch([
    // The milestone 4 shape: foods at the root.
    db
      .prepare("UPDATE categories SET slug=?,name=? WHERE id=?")
      .bind("ground-beef", "Ground Beef", survivor),
    db
      .prepare("UPDATE categories SET slug=?,name=? WHERE id=?")
      .bind("beef-burgers", "Beef Burgers", burgers),
    db
      .prepare(
        "INSERT INTO categories(id,slug,name,is_rankable,is_active,created_at,updated_at) VALUES(?,?,?,1,0,1,1)",
      )
      .bind(donor, donor, "Minced Beef"),
    db
      .prepare(
        "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
      )
      .bind(f.productId, donor),
    // Ratings: one the merge moved from the donor, one always in the survivor.
    db
      .prepare(
        "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,conventional_recency,created_at,updated_at) VALUES(?,?,?,?,4,NULL,10,10),(?,?,?,?,5,'within_month',20,20),(?,?,?,?,3,NULL,30,30)",
      )
      .bind(
        moved,
        a.id,
        f.versionId,
        survivor,
        stay,
        b.id,
        f.versionId,
        survivor,
        id(),
        c.id,
        f.versionId,
        burgers,
      ),
    db
      .prepare(
        "INSERT INTO moderation_actions(id,actor_id,kind,target_id,before_data,after_data,note,created_at) VALUES(?,?,'category_merge',?,'{}',?,'Milestone 4 merge.',5)",
      )
      .bind(
        actionId,
        a.id,
        donor,
        JSON.stringify({ mergeId, survivorId: survivor }),
      ),
    db
      .prepare(
        "INSERT INTO category_merges(id,donor_id,survivor_id,action_id,state,active,finalize_data,created_at,updated_at) VALUES(?,?,?,?,'complete',1,?,5,5)",
      )
      .bind(
        mergeId,
        donor,
        survivor,
        actionId,
        JSON.stringify({ children: [], aliasIds: [], features: [] }),
      ),
    db
      .prepare(
        "INSERT INTO category_merge_moves(merge_id,entity_type,entity_id,product_id,role,prior_counted,created_at) VALUES(?,'rating',?,?,'moved',1,5),(?,'membership',?,?,'membership_existing',NULL,5)",
      )
      .bind(mergeId, moved, f.productId, mergeId, f.productId, f.productId),
  ]);
  const ledger = await db
    .prepare(
      "SELECT * FROM category_merge_moves WHERE merge_id=? ORDER BY 1,2,3",
    )
    .bind(mergeId)
    .all();

  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  expect(
    (
      await db
        .prepare(
          "SELECT * FROM category_merge_moves WHERE merge_id=? ORDER BY 1,2,3",
        )
        .bind(mergeId)
        .all()
    ).results,
  ).toEqual(ledger.results);
  // Familiarity starts from every counted rating (no answers yet).
  expect(
    await db
      .prepare(
        "SELECT recency,overall_similarity AS score,rating_count AS n FROM product_category_familiarity_stats WHERE product_version_id=? ORDER BY category_id,recency,score",
      )
      .bind(f.versionId)
      .all(),
  ).toMatchObject({
    results: expect.arrayContaining([
      { recency: "unanswered", score: 4, n: 1 },
      { recency: "within_month", score: 5, n: 1 },
      { recency: "unanswered", score: 3, n: 1 },
    ]),
  });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );

  const ratings = new RatingsService(
    new D1RatingsRepository(db),
    { priorMean: 3.5, priorStrength: 10 },
    id,
  );
  const service = new TaxonomyService(
    new D1TaxonomyRepository(new ModerationRepository(db), id),
    {} as ModerationDecisionService,
    {
      rebuildVersions: (ids) => ratings.rebuildVersions(ids),
      rebuildSearch: () => rebuildSearchIndex(db),
      refreshTrending: async () => {},
      invalidate: async () => {},
    },
    id,
  );
  const operator = { ...a, administrator: true };
  // The milestone 4 merge still reverses after the upgrade.
  expect(
    await service.reverseMerge(
      operator,
      id(),
      mergeId,
      "Reversed after the upgrade.",
    ),
  ).toMatchObject({ state: "reversed" });
  expect(
    await db
      .prepare("SELECT category_id FROM ratings WHERE id=?")
      .bind(moved)
      .first("category_id"),
  ).toBe(donor);

  // Seed the launch taxonomy, then move existing foods into it.
  const now = Date.now();
  await db.batch(taxonomySeedStatements(id, now).map((sql) => db.prepare(sql)));
  const targets = [
    ...TAXONOMY_GROUPS.map((g) => ({ ...g, rankable: false })),
    ...TAXONOMY_LEAVES.map((l) => ({ ...l, rankable: true })),
  ];
  const first = await reshapeTaxonomy(service, operator, targets, true);
  expect(first.problems).toEqual([]);
  expect(first.moves).toEqual(
    expect.arrayContaining([
      { slug: "ground-beef", from: null, to: "beef" },
      { slug: "beef-burgers", from: null, to: "beef" },
    ]),
  );
  // The restored duplicate is a food outside the launch tree: reported for
  // an operator to place, never moved by guesswork.
  expect(first.outside).toEqual([donor]);
  // A second run has nothing left to move.
  expect(
    (await reshapeTaxonomy(service, operator, targets, true)).moves,
  ).toEqual([]);
  // Each move is an ordinary, reversible taxonomy action.
  const groundMove = first.actions.find(
    (action) => action.slug === "ground-beef",
  )!;
  await service.reverseUpdate(
    operator,
    id(),
    groundMove.actionId,
    "Checking the move reverses.",
  );
  expect(
    await db
      .prepare("SELECT parent_id FROM categories WHERE id=?")
      .bind(survivor)
      .first("parent_id"),
  ).toBeNull();
  // Launch foods ask their own questions; any other food Taste and Texture.
  const questions = async (category: string) =>
    (
      await db
        .prepare(
          "SELECT key FROM category_rating_dimensions WHERE category_id=? ORDER BY sort_order",
        )
        .bind(category)
        .all<{ key: string }>()
    ).results.map((row) => row.key);
  expect(await questions(survivor)).toEqual(["taste", "texture", "browning"]);
  expect(await questions(donor)).toEqual(["taste", "texture"]);

  // Rebuilding derived data from canonical ratings matches the write path.
  const stats = async () =>
    (
      await db
        .prepare(
          "SELECT product_version_id,category_id,rating_count,rating_sum,bayesian_score FROM product_category_stats ORDER BY 1,2",
        )
        .all()
    ).results;
  let cursor: string | null = null;
  do cursor = (await ratings.rebuildPage(cursor)).next;
  while (cursor);
  const once = await stats();
  do cursor = (await ratings.rebuildPage(cursor)).next;
  while (cursor);
  expect(await stats()).toEqual(once);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
});
