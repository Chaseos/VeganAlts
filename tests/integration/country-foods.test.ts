import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { taxonomyServices } from "../../server/taxonomy/infrastructure/composition";
import { catalogService } from "../../server/catalog/infrastructure/composition";
import {
  categorySearchStatements,
  rebuildSearchIndex,
} from "../../server/catalog/infrastructure/search-index";
import { taxonomySeedStatements } from "../../db/seed/taxonomy";

const id = () => crypto.randomUUID();
const note = "Country availability maintenance for the test.";
const testEnv = {
  ...env,
  APP_ENV: "local",
  MODERATION_PROVIDER: "fake",
} as unknown as Cloudflare.Env;

async function people() {
  const [operator, contributor] = [`op-${id()}`, `contrib-${id()}`];
  await env.DB.batch(
    [operator, contributor].flatMap((user) => [
      env.DB.prepare(
        "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
      ).bind(user, "Test identity", `${user}@example.invalid`),
      env.DB.prepare(
        "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,1,1)",
      ).bind(user, user),
    ]),
  );
  return {
    operator: { id: operator, accountState: "active", administrator: true },
    contributor: {
      id: contributor,
      accountState: "active",
      administrator: false,
    },
  };
}
const shelf = async (slug: string) =>
  (await env.DB.prepare("SELECT id FROM categories WHERE slug=?")
    .bind(slug)
    .first("id")) as string;
const foodsIn = async (code: string) =>
  (await catalogService(env).page(code)).aisles.flatMap((a) =>
    a.shelves.flatMap((s) => s.foods.map((f) => f.slug)),
  );

it("lists a suggested food only where it is on, and lets operators switch countries", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  await rebuildSearchIndex(env.DB);
  const { operator, contributor } = await people();
  const service = taxonomyServices(testEnv, id);
  const s = id().slice(0, 6);
  const proposal = await service.propose(contributor, id(), {
    name: `Sausage rolls ${s}`,
    shelfId: await shelf("pork"),
    country: "GB",
    explanation: "Sold in most British supermarkets.",
  });
  expect((await service.proposalDetail(operator, proposal.id)).country).toBe(
    "GB",
  );
  const { slug, categoryId } = (await service.decideProposal(
    operator,
    id(),
    proposal.id,
    {
      decision: "accept",
      expectedRevision: (await service.proposalDetail(operator, proposal.id))
        .revision,
      note,
    },
  )) as { slug: string; categoryId: string };
  // Accepted in the United Kingdom only.
  expect(
    (
      await env.DB.prepare(
        "SELECT co.iso2,cc.source FROM category_countries cc JOIN countries co ON co.id=cc.country_id WHERE cc.category_id=?",
      )
        .bind(categoryId)
        .all()
    ).results,
  ).toEqual([{ iso2: "GB", source: "proposal" }]);
  const catalog = catalogService(env);
  const [gb, us] = [await catalog.market("gb"), await catalog.market("us")];
  expect(await foodsIn("gb")).toContain(slug);
  expect(await foodsIn("us")).not.toContain(slug);
  // Its page elsewhere says so and lists nothing.
  const absent = await catalog.category(us, slug);
  expect(absent.availability).toEqual({ here: false, countries: ["gb"] });
  expect(absent.ranked).toEqual([]);
  expect((await catalog.category(gb, slug)).availability.here).toBe(true);
  // Search and the sitemap follow availability.
  const searched = async (market: typeof gb) =>
    (await catalog.search(market, `sausage rolls ${s}`)).categories.map(
      (c) => c.slug,
    );
  expect(await searched(gb)).toContain(slug);
  expect(await searched(us)).not.toContain(slug);
  const map = (await catalog.sitemap()).categories.filter(
    (c) => c.slug === slug,
  );
  expect(map.map((c) => c.country)).toEqual(["gb"]);

  // An operator opens it in the United States, then reverses that.
  const revision = async () =>
    (await service.tree(operator)).categories.find((c) => c.id === categoryId)!
      .revision;
  const opened = await service.setCountries(operator, id(), categoryId, {
    expectedRevision: await revision(),
    countries: ["GB", "US"],
    note,
  });
  expect(await foodsIn("us")).toContain(slug);
  expect(
    (await service.tree(operator)).categories.find((c) => c.id === categoryId)!
      .countries,
  ).toEqual(["GB", "US"]);
  await service.reverseUpdate(operator, id(), opened.actionId, note);
  expect(await foodsIn("us")).not.toContain(slug);
  // Aisles and shelves cannot be scoped.
  await expect(
    service.setCountries(operator, id(), await shelf("pork"), {
      expectedRevision: 0,
      countries: ["GB"],
      note,
    }),
  ).rejects.toMatchObject({ code: "INVALID_COUNTRIES" });

  // A product published in the United States switches it on there, and it
  // then stays on.
  const usId = (await env.DB.prepare(
    "SELECT id FROM countries WHERE iso2='US'",
  ).first("id")) as string;
  const product = `product-${s}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO products(id,country_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    ).bind(product, usId, "Rolls", product),
    env.DB.prepare(
      "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(product, categoryId),
    ...categorySearchStatements(env.DB, product),
  ]);
  expect(await foodsIn("us")).toContain(slug);
  expect(await searched(us)).toContain(slug);
  await expect(
    service.setCountries(operator, id(), categoryId, {
      expectedRevision: await revision(),
      countries: ["GB"],
      note,
    }),
  ).rejects.toMatchObject({ code: "FOOD_HAS_PRODUCTS" });

  // Turning a Canadian suggestion into an alias opens the food in Canada.
  const alias = await service.propose(contributor, id(), {
    name: `Banger rolls ${s}`,
    shelfId: await shelf("pork"),
    // The explanation is optional (milestone 6).
    country: "CA",
  });
  await service.decideProposal(operator, id(), alias.id, {
    decision: "alias",
    aliasOf: categoryId,
    expectedRevision: (await service.proposalDetail(operator, alias.id))
      .revision,
    note,
  });
  expect(await foodsIn("ca")).toContain(slug);
});

it("shows a newly opened country the shared aisles to start from", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  // Opening a country switches no foods on there.
  await env.DB.prepare(
    "INSERT INTO countries(id,iso2,name,is_active,created_at,updated_at) VALUES(?,'DE','Germany',1,1,1)",
  )
    .bind(`country-${id()}`)
    .run();
  const catalog = catalogService(env);
  const de = await catalog.market("de");
  expect(await foodsIn("de")).toEqual([]);
  // An operator switching one food on doesn't hide the rest before any
  // product arrives.
  await env.DB.prepare(
    "INSERT INTO category_countries(category_id,country_id,source,created_at) SELECT id,?,'operator',1 FROM categories WHERE slug='bacon'",
  )
    .bind(de.id)
    .run();
  const home = await catalog.home(de);
  expect(home.counts.products).toBe(0);
  expect(home.aisles.map((a) => a.slug)).toEqual(
    expect.arrayContaining(["meat", "dairy"]),
  );
  expect(
    home.aisles.flatMap((a) => a.shelves.flatMap((s) => s.foods)),
  ).toContainEqual(
    expect.objectContaining({
      slug: "ground-beef",
      best: null,
      productCount: 0,
    }),
  );
  // Its aisle pages list the same shared foods.
  const meat = await catalog.aisle(de, "meat");
  expect(
    meat.kind === "aisle" && meat.shelves.flatMap((s) => s.foods).length,
  ).toBeGreaterThan(1);
  // A first product without a rating switches its food on and counts.
  const beef = (await env.DB.prepare(
    "SELECT id FROM categories WHERE slug='ground-beef'",
  ).first("id")) as string;
  const product = `de-product-${id()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO products(id,country_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    ).bind(product, de.id, "Erstes Hack", product),
    env.DB.prepare(
      "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
    ).bind(`${product}-v`, product),
    env.DB.prepare(
      "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(product, beef),
  ]);
  const started = await catalog.home(de);
  const startedFoods = started.aisles.flatMap((a) =>
    a.shelves.flatMap((s) => s.foods),
  );
  expect(startedFoods).toHaveLength(2);
  expect(startedFoods).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ slug: "bacon", productCount: 0 }),
      expect.objectContaining({
        slug: "ground-beef",
        best: null,
        productCount: 1,
      }),
    ]),
  );
});

it("closes a country an alias opened when it is reversed, and drops a demoted food's countries", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const { operator, contributor } = await people();
  const service = taxonomyServices(testEnv, id);
  const s = id().slice(0, 6);
  const on = async (categoryId: string) =>
    (
      await env.DB.prepare(
        "SELECT co.iso2 FROM category_countries cc JOIN countries co ON co.id=cc.country_id WHERE cc.category_id=? ORDER BY co.iso2",
      )
        .bind(categoryId)
        .all<{ iso2: string }>()
    ).results.map((r) => r.iso2);
  const created = (await service.create(operator, id(), {
    name: `Hot links ${s}`,
    isRankable: true,
    parentId: await shelf("pork"),
    countries: ["US"],
    note,
  })) as { categoryId: string };
  expect(await on(created.categoryId)).toEqual(["US"]);
  // A British suggestion aliased to it opens it in the United Kingdom.
  const proposal = await service.propose(contributor, id(), {
    name: `Red sausages ${s}`,
    shelfId: await shelf("pork"),
    country: "GB",
  });
  const aliased = (await service.decideProposal(operator, id(), proposal.id, {
    decision: "alias",
    aliasOf: created.categoryId,
    expectedRevision: (await service.proposalDetail(operator, proposal.id))
      .revision,
    note,
  })) as { actionId: string };
  expect(await on(created.categoryId)).toEqual(["GB", "US"]);
  // Reversing the alias closes it there again.
  await service.reverseUpdate(operator, id(), aliased.actionId, note);
  expect(await on(created.categoryId)).toEqual(["US"]);

  // Demoted to a group, a food without products leaves every country; made a
  // food again, it starts in every active country.
  const revision = async () =>
    (await service.tree(operator)).categories.find(
      (c) => c.id === created.categoryId,
    )!.revision;
  const demoted = (await service.update(operator, id(), created.categoryId, {
    expectedRevision: await revision(),
    isRankable: false,
    note,
  })) as { actionId: string };
  expect(await on(created.categoryId)).toEqual([]);
  // Reversing the demotion restores exactly the countries it had.
  await service.reverseUpdate(operator, id(), demoted.actionId, note);
  expect(await on(created.categoryId)).toEqual(["US"]);
  await service.update(operator, id(), created.categoryId, {
    expectedRevision: await revision(),
    isRankable: false,
    note,
  });
  await service.update(operator, id(), created.categoryId, {
    expectedRevision: await revision(),
    isRankable: true,
    note,
  });
  expect((await on(created.categoryId)).length).toBeGreaterThan(1);
});

it("skips a shelf level that only repeats its aisle or food", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const catalog = catalogService(env);
  const gb = await catalog.market("gb");
  const home = await catalog.home(gb);
  const shelves = (aisle: string) =>
    home.aisles.find((a) => a.slug === aisle)!.shelves;
  expect(shelves("eggs-aisle").map((s) => s.silent)).toEqual([true]);
  expect(shelves("dairy").every((s) => s.silent)).toBe(true);
  expect(shelves("meat").some((s) => s.silent)).toBe(false);
  // Empty starter shelves stay out of browsing but are offered for proposals.
  expect(shelves("meat").map((s) => s.slug)).not.toContain("turkey-shelf");
  expect(
    (await catalog.shelves(gb)).flatMap((a) => a.shelves).map((s) => s.slug),
  ).toContain("turkey-shelf");
  expect((await catalog.category(gb, "eggs")).place).toEqual({
    aisle: { slug: "eggs-aisle", name: "Eggs" },
    shelf: null,
  });
  expect((await catalog.category(gb, "ground-beef")).place.shelf).toEqual({
    slug: "beef",
    name: "Beef",
  });
  const dairy = await catalog.aisle(gb, "dairy");
  expect(dairy.kind === "aisle" && dairy.shelves.every((s) => s.silent)).toBe(
    true,
  );
});
