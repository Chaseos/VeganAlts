import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { taxonomySeedStatements } from "../../db/seed/taxonomy";
import type { Answers } from "../../server/moderation/domain/decisions";
import { ModerationRepository } from "../../server/community/infrastructure/moderation-repository";
import { AisleDemandService } from "../../server/taxonomy/application/aisle-demand";
import { categoryKey, categorySlug } from "../../server/taxonomy/domain/taxonomy";
import { aisleTree } from "../../server/taxonomy/domain/shape";
import { taxonomyServices } from "../../server/taxonomy/infrastructure/composition";
import { D1TaxonomyRepository } from "../../server/taxonomy/infrastructure/d1-taxonomy-repository";

const id = () => crypto.randomUUID();
const tag = () => id().replaceAll("-", "").slice(0, 8);
const testEnv = {
  ...env,
  APP_ENV: "local",
  MODERATION_PROVIDER: "fake",
  RANKING_PRIOR_MEAN: "3.5",
  RANKING_PRIOR_STRENGTH: "10",
} as unknown as Cloudflare.Env;
const answer = (probabilities: Record<string, number>) => ({
  option: Object.keys(probabilities)[0]!,
  confidence: 1,
  probabilities,
});
const sensible: Answers = {
  sensible: answer({ YES: 0.9 }),
  same_aisle: answer({ NEW: 0.9 }),
};

async function account(createdAt = 1) {
  const user = `aisle-${id()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
    ).bind(user, "Test identity", `${user}@example.invalid`),
    env.DB.prepare(
      "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,?,1)",
    ).bind(user, user, createdAt),
  ]);
  return user;
}

// Each test has its own country: caps count per country.
async function world(answers: Answers, modes = '{"default":"auto"}') {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const country = id();
  const iso2 = `${String.fromCharCode(65 + Math.floor(Math.random() * 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO countries(id,iso2,name,created_at,updated_at) VALUES(?,?,'Testland',1,1)",
  )
    .bind(country, iso2)
    .run();
  const countryId = (await env.DB.prepare(
    "SELECT id FROM countries WHERE iso2=?",
  )
    .bind(iso2)
    .first("id")) as string;
  await env.DB.prepare("UPDATE countries SET is_active=1 WHERE id=?")
    .bind(countryId)
    .run();
  const taxonomy = taxonomyServices(testEnv, id);
  const repository = new D1TaxonomyRepository(
    new ModerationRepository(env.DB),
    id,
  );
  let now = Date.now();
  const service = new AisleDemandService(
    repository,
    {
      async evaluate() {
        return {
          id: id(),
          status: "completed",
          outcome: "READY",
          reasons: [],
          flags: [],
          answers,
        };
      },
    },
    async () => ({
      name: "test",
      describe: async (food) => ({
        englishName: food.name,
        gloss: "A kind of grocery shoppers browse.",
        slug: categorySlug(food.name),
        readings: [],
        frenchName: "",
        japaneseName: "",
      }),
    }),
    (key, aisle, foods, note, actor) =>
      taxonomy.openLocalAisle(key, aisle, foods, note, actor),
    modes,
    id,
    () => now,
  );
  const closest = (await env.DB.prepare(
    "SELECT id FROM categories WHERE slug='chicken'",
  ).first("id")) as string;
  const suggest = async (
    user: string,
    aisle: string,
    name = `Food ${tag()}`,
  ) => {
    const proposal = id();
    await env.DB.prepare(
      `INSERT INTO category_proposals(id,submitted_by,name,parent_id,country_id,explanation,proposed_data,created_at,updated_at)
      VALUES(?,?,?,?,?,'',?,?,?)`,
    )
      .bind(
        proposal,
        user,
        name,
        closest,
        countryId,
        JSON.stringify({ name, aliases: [], newAisle: { name: aisle } }),
        now,
        now,
      )
      .run();
    return proposal;
  };
  return {
    service,
    taxonomy,
    suggest,
    closest,
    countryId,
    advance(ms: number) {
      now += ms;
    },
    async aisle(name: string) {
      return env.DB.prepare(
        "SELECT * FROM aisle_proposals WHERE country_id=? AND name_key=? ORDER BY created_at DESC",
      )
        .bind(countryId, categoryKey(name))
        .first<{
          status: string;
          opened_category_id: string | null;
          resolution_note: string | null;
        }>();
    },
  };
}

it("gathers demand from three accounts, opens the aisle and moves its foods", async () => {
  const w = await world(sensible);
  const name = `Pickles ${tag()}`;
  const accepted = await w.suggest(await account(), name);
  await w.taxonomy.decideAutomatically(accepted, {
    decision: "accept",
    note: "Accepted automatically as a provisional food.",
  });
  const waiting = await w.suggest(await account(), name);
  // The food sits in the closest aisle the whole time.
  const first = await env.DB.prepare(
    "SELECT parent_id FROM categories WHERE id=(SELECT resolved_category_id FROM category_proposals WHERE id=?)",
  )
    .bind(accepted)
    .first("parent_id");
  expect(first).toBe(w.closest);
  await w.service.sweep();
  expect((await w.aisle(name))?.status).toBe("gathering");
  await w.suggest(await account(), name);
  await w.service.sweep();
  const opened = await w.aisle(name);
  expect(opened?.status).toBe("opened");
  const aisle = await env.DB.prepare(
    "SELECT origin_country_id,parent_id,is_rankable FROM categories WHERE id=?",
  )
    .bind(opened!.opened_category_id)
    .first<{ origin_country_id: string; is_rankable: number }>();
  expect(aisle).toMatchObject({
    origin_country_id: w.countryId,
    is_rankable: 0,
  });
  const moved = await env.DB.prepare(
    "SELECT parent_id FROM categories WHERE id=(SELECT resolved_category_id FROM category_proposals WHERE id=?)",
  )
    .bind(accepted)
    .first("parent_id");
  expect(moved).toBe(opened!.opened_category_id);
  // A food still undecided keeps its closest aisle.
  const pending = await env.DB.prepare(
    "SELECT status,parent_id FROM category_proposals WHERE id=?",
  )
    .bind(waiting)
    .first();
  expect(pending).toMatchObject({ status: "pending", parent_id: w.closest });
});

it("counts one person once, and not a new account", async () => {
  const w = await world(sensible);
  const name = `Relish ${tag()}`;
  const person = await account();
  await w.suggest(person, name);
  await w.suggest(person, name);
  await w.suggest(await account(Date.now()), name);
  await w.suggest(await account(), name);
  await w.service.sweep();
  expect((await w.aisle(name))?.status).toBe("gathering");
});

it("a queue-only country waits for an operator, who can open the aisle", async () => {
  const w = await world(sensible, '{"default":"queue"}');
  const name = `Tinned fish ${tag()}`;
  for (let i = 0; i < 3; i += 1) await w.suggest(await account(), name);
  await w.service.sweep();
  const queued = await w.aisle(name);
  expect(queued).toMatchObject({
    status: "queued",
    resolution_note: "country_is_queue_only",
  });
  const row = (await env.DB.prepare(
    "SELECT id FROM aisle_proposals WHERE country_id=? AND status='queued'",
  )
    .bind(w.countryId)
    .first("id")) as string;
  const operator = { id: await account(), administrator: true } as never;
  await w.service.decide(operator, row, {
    decision: "open",
    name,
    note: "Shoppers here look for this.",
  });
  expect((await w.aisle(name))?.status).toBe("opened");
});

it("closes what isn't a kind of product, and an aisle that already exists", async () => {
  const w = await world({
    sensible: answer({ NO: 0.9 }),
    same_aisle: answer({ NEW: 0.9 }),
  });
  const name = `Party food ${tag()}`;
  for (let i = 0; i < 3; i += 1) await w.suggest(await account(), name);
  await w.service.sweep();
  expect(await w.aisle(name)).toMatchObject({
    status: "closed",
    resolution_note: "not_a_kind_of_product",
  });
  await w.suggest(await account(), "Chicken");
  await w.service.sweep();
  expect((await w.aisle("Chicken"))?.status).toBe("closed");
});

it("holds a second aisle in a week for an operator", async () => {
  const w = await world(sensible);
  const [one, two] = [`Noodles ${tag()}`, `Soups ${tag()}`];
  for (const name of [one, two])
    for (let i = 0; i < 3; i += 1) await w.suggest(await account(), name);
  await w.service.sweep();
  const statuses = [
    (await w.aisle(one))?.status,
    (await w.aisle(two))?.status,
  ].sort();
  expect(statuses).toEqual(["opened", "queued"]);
});

it("closes a suggestion after 180 days without support", async () => {
  const w = await world(sensible);
  const name = `Crackers ${tag()}`;
  await w.suggest(await account(), name);
  await w.service.sweep();
  w.advance(181 * 86_400_000);
  await w.service.sweep();
  expect((await w.aisle(name))?.status).toBe("closed");
});

it("lists a local aisle only at home, or where one of its foods is on", () => {
  const nodes = [
    { id: "root", slug: "root", name: "Root", parentId: null, isRankable: 0 },
    {
      id: "local",
      slug: "local",
      name: "Local",
      parentId: "root",
      isRankable: 0,
      originCountryId: "jp",
    },
    {
      id: "food",
      slug: "food",
      name: "Food",
      parentId: "local",
      isRankable: 1,
      available: 0,
    },
  ];
  const listed = (country: string, available: number) =>
    aisleTree(
      nodes.map((n) => (n.id === "food" ? { ...n, available } : n)),
      new Map(),
      { withEmpty: true, country },
    ).map((a) => a.id);
  expect(listed("jp", 0)).toEqual(["local"]);
  expect(listed("us", 0)).toEqual([]);
  expect(listed("us", 1)).toEqual(["local"]);
});

it("a suggestion can't name an aisle that already exists", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const user = await account();
  const taxonomy = taxonomyServices(testEnv, id);
  const closest = (await env.DB.prepare(
    "SELECT id FROM categories WHERE slug='chicken'",
  ).first("id")) as string;
  await expect(
    taxonomy.propose(
      { id: user, administrator: false, accountState: "active" } as never,
      `key-${tag()}-aaaaaaaaaaaa`,
      {
        name: `Sambal ${tag()}`,
        aisleId: closest,
        country: "us",
        newAisle: { name: "Chicken" },
      },
    ),
  ).rejects.toMatchObject({ code: "AISLE_EXISTS" });
});
