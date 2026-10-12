import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { TaxonomyService } from "../../server/taxonomy/application/taxonomy-service";
import { reshapeTaxonomy } from "../../server/taxonomy/application/reshape";
import { D1TaxonomyRepository } from "../../server/taxonomy/infrastructure/d1-taxonomy-repository";
import { ModerationRepository } from "../../server/community/infrastructure/moderation-repository";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { rebuildSearchIndex } from "../../server/catalog/infrastructure/search-index";
import { taxonomyShape } from "../../server/taxonomy/domain/shape";
import type { ModerationDecisionService } from "../../server/moderation/application/decision-service";
import {
  TAXONOMY_GROUPS,
  TAXONOMY_LEAVES,
  taxonomySeedStatements,
} from "../../db/seed/taxonomy";

const id = () => crypto.randomUUID();

// An environment on the milestone 5/6 three-level tree (Food → aisle → shelf
// → food) moves to the milestone 7 two-level tree (Food → aisle → food).
it("reshapes the three-level tree into aisles and retires the emptied groups", async () => {
  const db = env.DB;
  const f = await catalogFixture(db, 1);
  const operator = { ...f.users[0]!, administrator: true };
  // [slug, name, parent slug, rankable]
  const old: [string, string, string | null, number][] = [
    ["food", "Food", null, 0],
    ["meat", "Meat", "food", 0],
    ["beef", "Beef", "meat", 0],
    ["ground-beef", "Ground Beef", "beef", 1],
    ["turkey-shelf", "Turkey", "meat", 0],
    ["dairy", "Dairy", "food", 0],
    ["milk-shelf", "Milk", "dairy", 0],
    ["milk", "Milk", "milk-shelf", 1],
    ["cheese", "Cheese", "food", 0],
    ["block-and-shredded", "Block and shredded", "cheese", 0],
    ["cheddar", "Cheddar", "block-and-shredded", 1],
    ["eggs-aisle", "Eggs", "food", 0],
    ["eggs-shelf", "Eggs", "eggs-aisle", 0],
    ["eggs", "Eggs", "eggs-shelf", 1],
  ];
  await db.batch(
    old.map(([slug, name, parent, rankable]) =>
      db
        .prepare(
          `INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at)
          VALUES(?,(SELECT id FROM categories WHERE slug=?),?,?,?,1,1)`,
        )
        .bind(`old-${slug}`, parent, slug, name, rankable),
    ),
  );
  // The milestone 7 seed adds the new aisles and foods; existing slugs stay
  // where they are until the reshape moves them.
  await db.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => db.prepare(sql)),
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
  const targets = [
    ...TAXONOMY_GROUPS.map((g) => ({ ...g, rankable: false })),
    ...TAXONOMY_LEAVES.map((l) => ({ ...l, rankable: true })),
  ];
  const retiring = [
    "turkey-shelf",
    "milk-shelf",
    "block-and-shredded",
    "eggs-shelf",
    "meat",
    "dairy",
  ];
  // A dry run reports exactly what a real run does, and changes nothing.
  const dry = await reshapeTaxonomy(service, operator, targets, false);
  expect(dry.problems).toEqual([]);
  expect([...dry.retired].sort()).toEqual([...retiring].sort());
  expect(dry.actions).toEqual([]);
  const applied = await reshapeTaxonomy(service, operator, targets, true);
  expect(applied.moves).toEqual(dry.moves);
  // Deepest first: shelves go before their old aisles.
  expect(applied.retired).toEqual(dry.retired);
  expect(applied.retired.slice(-2).sort()).toEqual(["dairy", "meat"]);
  expect(applied.moves).toEqual(
    expect.arrayContaining([
      { slug: "beef", from: "meat", to: "food" },
      { slug: "milk", from: "milk-shelf", to: "milk-aisle" },
      { slug: "cheddar", from: "block-and-shredded", to: "cheese" },
      { slug: "eggs", from: "eggs-shelf", to: "eggs-aisle" },
    ]),
  );
  // Every launch category now fits the two levels; only the fixture's own
  // root-level foods are left for an operator to place.
  expect(applied.outside.sort()).toEqual([...f.categories].sort());
  const tree = await service.tree(operator);
  const bySlug = new Map(tree.categories.map((c) => [c.slug, c]));
  for (const slug of retiring) expect(bySlug.get(slug)!.isActive).toBe(0);
  const shape = taxonomyShape(tree.categories.filter((c) => c.isActive));
  for (const leaf of TAXONOMY_LEAVES)
    expect(shape.get(bySlug.get(leaf.slug)!.id)).toMatchObject({
      depth: 2,
      outsideDepth: false,
    });
  // A second run has nothing left to do.
  const again = await reshapeTaxonomy(service, operator, targets, true);
  expect(again.moves).toEqual([]);
  expect(again.retired).toEqual([]);
  // Each change is an ordinary, reversible taxonomy action.
  const retiredMeat = applied.actions.find((a) => a.slug === "meat")!;
  await service.reverseUpdate(
    operator,
    id(),
    retiredMeat.actionId,
    "Checking the retirement reverses.",
  );
  expect(
    await db
      .prepare("SELECT is_active FROM categories WHERE slug='meat'")
      .first("is_active"),
  ).toBe(1);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
});
