import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { taxonomySeedStatements } from "../../db/seed/taxonomy";
import type { Answers } from "../../server/moderation/domain/decisions";
import type { DecisionRequest } from "../../server/moderation/application/decision-service";
import type { TextOutput } from "../../server/moderation/domain/food-review";
import { FakeTextProvider } from "../../server/moderation/infrastructure/fake-text-provider";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";
import { FoodReviewService } from "../../server/taxonomy/application/food-review";
import { taxonomyServices } from "../../server/taxonomy/infrastructure/composition";
import { D1TaxonomyRepository } from "../../server/taxonomy/infrastructure/d1-taxonomy-repository";
import { ModerationRepository } from "../../server/community/infrastructure/moderation-repository";

const id = () => crypto.randomUUID();
const testEnv = {
  ...env,
  APP_ENV: "local",
  MODERATION_PROVIDER: "fake",
  RANKING_PRIOR_MEAN: "3.5",
  RANKING_PRIOR_STRENGTH: "10",
} as unknown as Cloudflare.Env;
// Each test has its own food: the taxonomy keeps names and addresses unique.
const dish = () => {
  const tag = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
  const name = `唐揚げ${tag}`;
  const text: TextOutput = {
    englishName: `Karaage ${tag}`,
    gloss: "Japanese deep-fried chicken pieces.",
    slug: `karaage-${tag}`,
    readings: [`からあげ${tag}`],
    frenchName: "",
    japaneseName: name,
  };
  return { name, text, known: { [name]: text } };
};
const answer = (probabilities: Record<string, number>) => ({
  option: Object.keys(probabilities)[0]!,
  confidence: 1,
  probabilities,
});
const newFood: Answers = {
  food_reference: answer({ YES: 0.9 }),
  same_food: answer({ NEW: 0.9 }),
  name_claim: answer({ NONE: 0.9 }),
  spam: answer({ OK: 0.99 }),
};
const unsure: Answers = {
  ...newFood,
  food_reference: answer({ YES: 0.55 }),
  same_food: answer({ NEW: 0.55 }),
};

async function world(
  answers: Answers,
  modes: string,
  known: Record<string, TextOutput>,
) {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const user = `contrib-${id()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
    ).bind(user, "Test identity", `${user}@example.invalid`),
    env.DB.prepare(
      "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(user, user),
    env.DB.prepare(
      "INSERT OR IGNORE INTO countries(id,iso2,name,created_at,updated_at) VALUES('country-jp','JP','Japan',1,1)",
    ),
  ]);
  const taxonomy = taxonomyServices(testEnv, id);
  const requests: DecisionRequest[] = [];
  let now = Date.now();
  const service = new FoodReviewService(
    new D1TaxonomyRepository(new ModerationRepository(env.DB), id),
    {
      async evaluate(request) {
        requests.push(request);
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
    async () => new FakeTextProvider(known),
    (proposal, decision) => taxonomy.decideAutomatically(proposal, decision),
    modes,
    () => now,
  );
  const aisle = (await env.DB.prepare(
    "SELECT id FROM categories WHERE slug='chicken'",
  ).first("id")) as string;
  const suggest = async (name: string) => {
    const proposal = id();
    await env.DB.prepare(
      `INSERT INTO category_proposals(id,submitted_by,name,parent_id,country_id,explanation,proposed_data,created_at,updated_at)
      VALUES(?,?,?,?,(SELECT id FROM countries WHERE iso2='JP'),'',?,?,?)`,
    )
      .bind(
        proposal,
        user,
        name,
        aisle,
        JSON.stringify({ name, aliases: [], language: "ja" }),
        now,
        now,
      )
      .run();
    return proposal;
  };
  const row = (proposal: string) =>
    env.DB.prepare(
      "SELECT status,review,resolved_by AS resolvedBy,resolved_category_id AS food FROM category_proposals WHERE id=?",
    )
      .bind(proposal)
      .first<{
        status: string;
        review: string | null;
        resolvedBy: string | null;
        food: string | null;
      }>();
  return {
    service,
    suggest,
    row,
    requests,
    later: (ms: number) => {
      now += ms;
    },
  };
}
const HOUR = 3_600_000;

it("queues a suggestion with English context in queue mode", async () => {
  const food = dish();
  const w = await world(newFood, '{"default":"queue"}', food.known);
  const proposal = await w.suggest(food.name);
  expect(await w.service.sweep()).toBe(1);
  const row = await w.row(proposal);
  expect(row!.status).toBe("pending");
  const review = JSON.parse(row!.review!);
  expect(review.lane).toBe("accept");
  expect(review.text.englishName).toBe(food.text.englishName);
  // Each proposal is reviewed once, and model inputs hold no account data.
  expect(await w.service.sweep()).toBe(0);
  expect(Object.keys(w.requests[0]!.state).sort()).toEqual([
    "aisles",
    "candidates",
    "generated",
    "suggestion",
  ]);
  expect(Object.keys(w.requests[0]!.state.suggestion as object).sort()).toEqual(
    ["country", "language", "name"],
  );
});

it("does nothing while review is off", async () => {
  const food = dish();
  const w = await world(newFood, "", food.known);
  const proposal = await w.suggest(food.name);
  expect(await w.service.sweep()).toBe(0);
  w.later(100 * HOUR);
  expect(await w.service.expire()).toBe(0);
  expect((await w.row(proposal))!.status).toBe("pending");
});

it("accepts a food in auto mode, named in English and provisional", async () => {
  const dishes = dish();
  const w = await world(newFood, '{"default":"off","JP":"auto"}', dishes.known);
  const proposal = await w.suggest(dishes.name);
  await w.service.sweep();
  const row = await w.row(proposal);
  expect(row).toMatchObject({
    status: "accepted",
    resolvedBy: "veganalts-system",
  });
  const food = await env.DB.prepare(
    "SELECT name,slug,provisional_until AS provisional FROM categories WHERE id=?",
  )
    .bind(row!.food)
    .first<{ name: string; slug: string; provisional: number }>();
  expect(food).toMatchObject({
    name: dishes.text.englishName,
    slug: dishes.text.slug,
  });
  expect(food!.provisional).toBeGreaterThan(Date.now());
  // What was typed stays findable.
  const aliases = await env.DB.prepare(
    "SELECT alias FROM category_aliases WHERE category_id=?",
  )
    .bind(row!.food)
    .all<{ alias: string }>();
  expect(aliases.results.map((a) => a.alias)).toContain(dishes.name);
  const on = await env.DB.prepare(
    "SELECT co.iso2 FROM category_countries cc JOIN countries co ON co.id=cc.country_id WHERE cc.category_id=?",
  )
    .bind(row!.food)
    .all<{ iso2: string }>();
  expect(on.results.map((r) => r.iso2)).toEqual(["JP"]);
});

it("refuses a claim before any model runs", async () => {
  const w = await world(newFood, '{"default":"auto"}', {});
  const proposal = await w.suggest("ヴィーガン唐揚げ");
  await w.service.sweep();
  expect(w.requests).toEqual([]);
  expect((await w.row(proposal))!.status).toBe("rejected");
});

it("decides at the 72-hour deadline by what review leaned toward", async () => {
  const food = dish();
  const w = await world(unsure, '{"default":"queue"}', food.known);
  const leaning = await w.suggest(food.name);
  const noText = await w.suggest("何か");
  await w.service.sweep();
  expect(await w.service.expire()).toBe(0);
  w.later(73 * HOUR);
  expect(await w.service.expire()).toBeGreaterThanOrEqual(2);
  expect((await w.row(leaning))!.status).toBe("accepted");
  // With no usable English there's nothing to lean on.
  expect((await w.row(noText))!.status).toBe("rejected");
});

it("rejects at the deadline when the name has been taken since", async () => {
  const food = dish();
  const w = await world(unsure, '{"default":"queue"}', food.known);
  const first = await w.suggest(food.name);
  const second = await w.suggest(`${food.name} 2`);
  await w.service.sweep();
  await env.DB.prepare("UPDATE category_proposals SET review=? WHERE id=?")
    .bind((await w.row(first))!.review, second)
    .run();
  w.later(73 * HOUR);
  expect(await w.service.expire()).toBeGreaterThanOrEqual(2);
  expect((await w.row(first))!.status).toBe("accepted");
  expect((await w.row(second))!.status).toBe("rejected");
});

it("retries a review that failed", async () => {
  const food = dish();
  const w = await world(newFood, '{"default":"queue"}', food.known);
  const proposal = await w.suggest(food.name);
  const failing = new FoodReviewService(
    new D1TaxonomyRepository(new ModerationRepository(env.DB), id),
    {
      async evaluate() {
        return {
          id: null,
          status: "failed",
          outcome: "NEEDS_REVIEW",
          reasons: [],
          flags: [],
        };
      },
    },
    async () => new FakeTextProvider(food.known),
    async () => null,
    '{"default":"queue"}',
  );
  expect(await failing.sweep()).toBe(0);
  expect((await w.row(proposal))!.review).toBeNull();
  expect(await w.service.sweep()).toBe(1);
});

const operator = { id: "", accountState: "active", administrator: true };
async function operatorId() {
  const user = `operator-${id()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
    ).bind(user, "Operator", `${user}@example.invalid`),
    env.DB.prepare(
      "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(user, user),
  ]);
  return { ...operator, id: user };
}
const NOTE = "Not a real food on review.";

it("undoes an accepted food with no products", async () => {
  const food = dish();
  const w = await world(newFood, '{"default":"auto"}', food.known);
  const proposal = await w.suggest(food.name);
  await w.service.sweep();
  const accepted = await w.row(proposal);
  const actor = await operatorId();
  const taxonomy = taxonomyServices(testEnv, id);
  expect(
    (await taxonomy.digest(actor)).find((row) => row.id === proposal),
  ).toMatchObject({ status: "accepted", country: "JP" });
  await taxonomy.undoAutomatic(actor, id(), proposal, NOTE);
  expect((await w.row(proposal))!.status).toBe("rejected");
  const retired = await env.DB.prepare(
    "SELECT is_active AS active FROM categories WHERE id=?",
  )
    .bind(accepted!.food)
    .first<{ active: number }>();
  expect(retired!.active).toBe(0);
  await expect(
    taxonomy.undoAutomatic(actor, id(), proposal, NOTE),
  ).rejects.toThrow("no longer");
});

it("undoes an automatic alias", async () => {
  const name = `牛乳${id().slice(0, 6)}`;
  const answers: Answers = {
    ...newFood,
    same_food: answer({ SAME: 0.9 }),
    closest_candidate: answer({ C1: 0.9 }),
  };
  const w = await world(answers, '{"default":"auto"}', {
    [name]: {
      englishName: "Milk",
      gloss: "Cow's milk.",
      slug: "milk",
      readings: [],
      frenchName: "",
      japaneseName: name,
    },
  });
  const proposal = await w.suggest(name);
  await w.service.sweep();
  const aliased = await w.row(proposal);
  expect(aliased!.status).toBe("aliased");
  const held = () =>
    env.DB.prepare(
      "SELECT COUNT(*) AS n FROM category_aliases WHERE category_id=? AND alias=?",
    )
      .bind(aliased!.food, name)
      .first<number>("n");
  expect(await held()).toBe(1);
  await taxonomyServices(testEnv, id).undoAutomatic(
    await operatorId(),
    id(),
    proposal,
    NOTE,
  );
  expect(await held()).toBe(0);
  expect((await w.row(proposal))!.status).toBe("rejected");
});

it("reviews one food straight away, and leaves a reviewed one alone", async () => {
  const { name, text, known } = dish();
  const w = await world(newFood, '{"default":"queue"}', known);
  const proposal = await w.suggest(name);
  await w.service.reviewNow(proposal);
  expect(w.requests).toHaveLength(1);
  const row = await env.DB.prepare(
    "SELECT status,review FROM category_proposals WHERE id=?",
  )
    .bind(proposal)
    .first<{ status: string; review: string }>();
  expect(row?.status).toBe("pending");
  expect(JSON.parse(row!.review).text.englishName).toBe(text.englishName);
  await w.service.reviewNow(proposal);
  expect(w.requests).toHaveLength(1);
});

it("keeps one open report per person, and an operator closes it", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const user = `reporter-${id()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
    ).bind(user, "Test identity", `${user}@example.invalid`),
    env.DB.prepare(
      "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,1,1)",
    ).bind(user, user),
  ]);
  const taxonomy = taxonomyServices(testEnv, id);
  const actor = { id: user, administrator: false, accountState: "active" } as never;
  const report = (reason: string) =>
    taxonomy.reportFood(actor, {
      food: "ground-beef",
      country: "us",
      reason,
    });
  await report("wrong_name");
  await report("duplicate_food");
  const admin = { id: user, administrator: true, accountState: "active" } as never;
  const open = (await taxonomy.foodReports(admin)).filter(
    (row) => row.reason === "duplicate_food",
  );
  expect(open).toHaveLength(1);
  await taxonomy.resolveFoodReport(admin, open[0]!.id, {
    status: "dismissed",
    note: "The name is the usual one here.",
  });
  await expect(
    taxonomy.resolveFoodReport(admin, open[0]!.id, {
      status: "dismissed",
      note: "The name is the usual one here.",
    }),
  ).rejects.toMatchObject({ code: "STALE_DECISION" });
  await expect(
    taxonomy.reportFood(actor, {
      food: "no-such-food",
      country: "us",
      reason: "other",
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("leaves a new food with no products out of the sitemap", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const repository = new D1CatalogRepository(env.DB);
  const listed = async () =>
    (await repository.sitemap()).categories.some(
      (row) => row.slug === "karaage-listed" && row.country === "us",
    );
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO categories(id,name,slug,parent_id,is_rankable,is_active,created_at,updated_at,provisional_until)
      VALUES('listed-food','Karaage listed','karaage-listed',(SELECT id FROM categories WHERE slug='chicken'),1,1,1,1,?)`,
    ).bind(Date.now() + 86_400_000),
    env.DB.prepare(
      "INSERT INTO category_countries(category_id,country_id,source,created_at) SELECT 'listed-food',id,'operator',1 FROM countries WHERE iso2='US'",
    ),
  ]);
  expect(await listed()).toBe(false);
  await env.DB.prepare(
    "UPDATE categories SET provisional_until=1 WHERE id='listed-food'",
  ).run();
  expect(await listed()).toBe(true);
});
