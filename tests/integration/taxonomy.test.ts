import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { taxonomyServices } from "../../server/taxonomy/infrastructure/composition";
import { catalogService } from "../../server/catalog/infrastructure/composition";
import { communityServices } from "../../server/community/infrastructure/composition";
import {
  TAXONOMY_LEAVES,
  TAXONOMY_PARENTS,
  taxonomySeedStatements,
} from "../../db/seed/taxonomy";

const id = () => crypto.randomUUID();
const note = "Operator taxonomy maintenance for the test.";
const testEnv = {
  ...env,
  APP_ENV: "local",
  MODERATION_PROVIDER: "fake",
  RANKING_PRIOR_MEAN: "3.5",
  RANKING_PRIOR_STRENGTH: "10",
} as unknown as Cloudflare.Env;
const taxonomy = () => taxonomyServices(testEnv, id);

async function world() {
  const f = await catalogFixture(env.DB, 6);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const s = crypto.randomUUID().slice(0, 8);
  const [D, S, C] = [`donor-${s}`, `survivor-${s}`, `child-${s}`];
  const P2 = `p2-${s}`,
    P3 = `p3-${s}`,
    V2 = `v2-${s}`,
    V3 = `v3-${s}`;
  const users = f.users.map((u) => u.id);
  const rating = (
    user: string,
    version: string,
    category: string,
    score: number,
    at: number,
  ) =>
    env.DB.prepare(
      "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    ).bind(
      `r-${user}-${version}-${category}`,
      user,
      version,
      category,
      score,
      at,
      at,
    );
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO categories(id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,1,1,1),(?,?,?,1,1,1)",
    ).bind(D, D, `Minced ${s}`, S, S, `Ground ${s}`),
    env.DB.prepare(
      "INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,?,1,1,1)",
    ).bind(C, D, C, `Child ${s}`),
    env.DB.prepare(
      "INSERT INTO category_aliases(id,category_id,alias,created_at) VALUES(?,?,?,1)",
    ).bind(id(), D, `mince ${s}`),
    env.DB.prepare(
      "INSERT INTO products(id,country_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1),(?,?,?,?,1,1)",
    ).bind(
      P2,
      f.countryId,
      `Second ${s}`,
      P2,
      P3,
      f.countryId,
      `Third ${s}`,
      P3,
    ),
    env.DB.prepare(
      "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1),(?,?,1,1,1)",
    ).bind(V2, P2, V3, P3),
    env.DB.prepare(
      "INSERT INTO product_categories(product_id,category_id,created_at,updated_at) VALUES(?,?,1,1),(?,?,1,1),(?,?,1,1),(?,?,1,1)",
    ).bind(f.productId, D, f.productId, S, P2, D, P3, D),
    // u0: survivor newer (donor loses); u1: donor newer (donor wins);
    // u2: donor only (moved); u3 on the second product (moved, link added).
    rating(users[0]!, f.versionId, D, 2, 100),
    rating(users[0]!, f.versionId, S, 4, 200),
    rating(users[1]!, f.versionId, D, 5, 300),
    rating(users[1]!, f.versionId, S, 3, 150),
    rating(users[2]!, f.versionId, D, 4, 120),
    rating(users[3]!, V2, D, 3, 130),
    env.DB.prepare(
      "INSERT INTO comments(id,user_id,product_id,product_version_id,category_id,body,created_at,updated_at) VALUES(?,?,?,?,?,?,1,1)",
    ).bind(`c-${s}`, users[4], P2, V2, D, "Browns well."),
    env.DB.prepare(
      "INSERT INTO category_features(country_id,category_id,position,updated_at) VALUES(?,?,99,1)",
    ).bind(f.countryId, D),
  ]);
  return { f, s, D, S, C, P2, P3, V2, V3, users };
}
const state = async (ids: string[]) =>
  JSON.stringify(
    (
      await env.DB.prepare(
        "SELECT id,user_id,category_id,is_counted FROM ratings WHERE id IN (SELECT value FROM json_each(?)) ORDER BY id",
      )
        .bind(JSON.stringify(ids))
        .all()
    ).results,
  );

it("transfers a merged category's ratings, links and metadata, then reverses exactly", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  const service = taxonomy();
  const ratingIds = (
    await env.DB.prepare("SELECT id FROM ratings WHERE category_id IN (?,?)")
      .bind(w.D, w.S)
      .all<{ id: string }>()
  ).results.map((r) => r.id);
  const before = await state(ratingIds);
  const tree = await service.tree(operator);
  const revision = (cid: string) =>
    tree.categories.find((c) => c.id === cid)!.revision;
  const merged = await service.merge(operator, id(), {
    donorId: w.D,
    survivorId: w.S,
    donorRevision: revision(w.D),
    survivorRevision: revision(w.S),
    note,
  });
  expect(merged).toMatchObject({ state: "complete" });
  const ratings = (
    await env.DB.prepare(
      "SELECT user_id,category_id,is_counted,overall_similarity FROM ratings WHERE id IN (SELECT value FROM json_each(?))",
    )
      .bind(JSON.stringify(ratingIds))
      .all<{
        user_id: string;
        category_id: string;
        is_counted: number;
        overall_similarity: number;
      }>()
  ).results;
  const counted = (user: string) =>
    ratings.filter((r) => r.user_id === user && r.is_counted === 1);
  // One counted rating per person, the most recently updated, in the survivor.
  expect(counted(w.users[0]!)).toEqual([
    expect.objectContaining({ category_id: w.S, overall_similarity: 4 }),
  ]);
  expect(counted(w.users[1]!)).toEqual([
    expect.objectContaining({ category_id: w.S, overall_similarity: 5 }),
  ]);
  expect(counted(w.users[2]!)).toEqual([
    expect.objectContaining({ category_id: w.S }),
  ]);
  // Raw ratings are never discarded: losers stay, uncounted.
  expect(ratings).toHaveLength(ratingIds.length);
  expect(
    ratings
      .filter((r) => r.category_id === w.D)
      .every((r) => r.is_counted === 0),
  ).toBe(true);
  const links = async () =>
    (
      await env.DB.prepare(
        "SELECT product_id||':'||category_id AS link FROM product_categories WHERE category_id IN (?,?) ORDER BY link",
      )
        .bind(w.D, w.S)
        .all<{ link: string }>()
    ).results.map((r) => r.link);
  expect(await links()).toEqual(
    [
      `${w.f.productId}:${w.D}`,
      `${w.f.productId}:${w.S}`,
      `${w.P2}:${w.S}`,
      `${w.P3}:${w.S}`,
    ].sort(),
  );
  expect(
    await env.DB.prepare("SELECT category_id FROM comments WHERE id=?")
      .bind(`c-${w.s}`)
      .first("category_id"),
  ).toBe(w.S);
  expect(
    await env.DB.prepare("SELECT parent_id FROM categories WHERE id=?")
      .bind(w.C)
      .first("parent_id"),
  ).toBe(w.S);
  const survivor = (await service.tree(operator)).categories.find(
    (c) => c.id === w.S,
  )!;
  expect(survivor.aliases).toContain(`Minced ${w.s}`);
  expect(survivor.aliases).toContain(`mince ${w.s}`);
  expect(await catalogService(env).categoryRedirect(w.D)).toBe(w.S);
  expect(
    await env.DB.prepare(
      "SELECT rating_count FROM product_category_stats WHERE product_version_id=? AND category_id=?",
    )
      .bind(w.f.versionId, w.S)
      .first("rating_count"),
  ).toBe(3);
  // A rating created after the merge survives its reversal.
  await env.DB.prepare(
    "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,4,900,900)",
  )
    .bind(`late-${w.s}`, w.users[4], w.V2, w.S)
    .run();
  const reversed = await service.reverseMerge(
    operator,
    id(),
    merged.mergeId,
    "Reversed: these are different products.",
  );
  expect(reversed).toMatchObject({ state: "reversed" });
  expect(await state(ratingIds)).toBe(before);
  expect(await links()).toEqual(
    [
      `${w.f.productId}:${w.D}`,
      `${w.f.productId}:${w.S}`,
      `${w.P2}:${w.D}`,
      `${w.P2}:${w.S}`,
      `${w.P3}:${w.D}`,
    ].sort(),
  );
  expect(
    await env.DB.prepare("SELECT category_id FROM comments WHERE id=?")
      .bind(`c-${w.s}`)
      .first("category_id"),
  ).toBe(w.D);
  expect(
    await env.DB.prepare("SELECT is_active FROM categories WHERE id=?")
      .bind(w.D)
      .first("is_active"),
  ).toBe(1);
  expect(
    await env.DB.prepare("SELECT parent_id FROM categories WHERE id=?")
      .bind(w.C)
      .first("parent_id"),
  ).toBe(w.D);
  expect(await catalogService(env).categoryRedirect(w.D)).toBeNull();
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});

it("re-derives Trending activity when a merge and its reversal move older ratings", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  // Outside the two days the hourly pass refreshes, inside the Trending window.
  const day = 86_400_000,
    at = Math.floor(Date.now() / day) * day - 5 * day + 3_600_000,
    date = new Date(at).toISOString().slice(0, 10);
  await env.DB.prepare(
    "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,5,?,?)",
  )
    .bind(`older-${w.s}`, w.users[4], w.V3, w.D, at, at)
    .run();
  const daily = async (category: string) =>
    await env.DB.prepare(
      "SELECT COALESCE(SUM(new_rating_count),0) AS n FROM product_category_daily_stats WHERE category_id=? AND stat_date=? AND product_version_id=?",
    )
      .bind(category, date, w.V3)
      .first<number>("n");
  const service = taxonomy();
  const tree = await service.tree(operator);
  const revision = (cid: string) =>
    tree.categories.find((c) => c.id === cid)!.revision;
  const merged = await service.merge(operator, id(), {
    donorId: w.D,
    survivorId: w.S,
    donorRevision: revision(w.D),
    survivorRevision: revision(w.S),
    note,
  });
  expect(merged).toMatchObject({ state: "complete" });
  expect(await daily(w.S)).toBe(1);
  expect(await daily(w.D)).toBe(0);
  await service.reverseMerge(
    operator,
    id(),
    merged.mergeId,
    "Reversed: these are different products.",
  );
  expect(await daily(w.D)).toBe(1);
  expect(await daily(w.S)).toBe(0);
});

it("validates slugs and names, redirects renamed slugs and reverses taxonomy edits", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  const service = taxonomy();
  await expect(
    service.create(operator, id(), {
      name: "Search",
      isRankable: true,
      note,
    }),
  ).rejects.toMatchObject({ code: "RESERVED_SLUG" });
  await expect(
    service.create(operator, id(), {
      name: `ground ${w.s}`,
      isRankable: true,
      note,
    }),
  ).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
  const created = await service.create(operator, id(), {
    name: `Chorizo ${w.s}`,
    parentId: w.S,
    isRankable: true,
    aliases: [`spanish sausage ${w.s}`],
    note,
  });
  const current = (await service.tree(operator)).categories.find(
    (c) => c.id === created.categoryId,
  )!;
  await expect(
    service.update(operator, id(), w.S, {
      expectedRevision: (await service.tree(operator)).categories.find(
        (c) => c.id === w.S,
      )!.revision,
      parentId: created.categoryId,
      note,
    }),
  ).rejects.toMatchObject({ code: "INVALID_PARENT" });
  const renamed = (await service.update(operator, id(), created.categoryId, {
    expectedRevision: current.revision,
    name: `Soy chorizo ${w.s}`,
    slug: `soy-chorizo-${w.s}`,
    note,
  })) as { actionId: string };
  expect(await catalogService(env).categoryRedirect(created.slug)).toBe(
    `soy-chorizo-${w.s}`,
  );
  await service.reverseUpdate(
    operator,
    id(),
    renamed.actionId,
    "Reverting the rename after review.",
  );
  expect(await catalogService(env).categoryRedirect(`soy-chorizo-${w.s}`)).toBe(
    created.slug,
  );
  expect(await catalogService(env).categoryRedirect(created.slug)).toBeNull();
  await service.setFeatures(operator, id(), {
    categoryIds: [w.S, created.categoryId],
    note,
  });
  const home = await catalogService(env).home();
  expect(home.featured.map((c) => c.id)).toEqual([w.S, created.categoryId]);
});

it("routes contributor category proposals through deterministic checks, automation and operator decisions", async () => {
  const w = await world();
  const contributor = {
    id: w.users[0]!,
    accountState: "active",
    administrator: false,
  };
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  const service = taxonomy();
  await expect(
    service.propose(contributor, id(), {
      name: `mince ${w.s}`,
      country: "US",
      explanation: "Shoppers look for this conventional food.",
    }),
  ).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
  await expect(
    service.propose(contributor, id(), {
      name: `Phone cases ${w.s}`,
      country: "US",
      explanation: "Not food at all [fake:food_reference=NO]",
    }),
  ).rejects.toMatchObject({ code: "PROPOSAL_NEEDS_CHANGES" });
  const proposal = await service.propose(contributor, id(), {
    name: `Bratwurst ${w.s}`,
    parentId: w.S,
    country: "US",
    explanation: "Plant-based bratwurst is now common in grocery stores.",
    exampleProducts: ["Example brat"],
    aliases: [`brats ${w.s}`],
  });
  const inbox = await communityServices(env).moderation.inbox(operator, null);
  expect(inbox.items).toContainEqual(
    expect.objectContaining({ id: proposal.id, kind: "category", tier: 3 }),
  );
  const detail = await service.proposalDetail(operator, proposal.id);
  const accepted = await service.decideProposal(operator, id(), proposal.id, {
    decision: "accept",
    expectedRevision: detail.revision,
    note: "Distinct reference food with several alternatives.",
  });
  expect(accepted).toMatchObject({ slug: `bratwurst-${w.s}` });
  expect((await service.proposalDetail(contributor, proposal.id)).status).toBe(
    "accepted",
  );
  const second = await service.propose(contributor, id(), {
    name: `Hamburger meat ${w.s}`,
    country: "US",
    explanation: "Another common name for this conventional food.",
  });
  await service.decideProposal(operator, id(), second.id, {
    decision: "alias",
    aliasOf: w.S,
    expectedRevision: (await service.proposalDetail(operator, second.id))
      .revision,
    note: "Same reference food; added as a search alias.",
  });
  expect(
    (await service.tree(operator)).categories.find((c) => c.id === w.S)!
      .aliases,
  ).toContain(`Hamburger meat ${w.s}`);
});

it("seeds the production-safe taxonomy idempotently without catalog data", async () => {
  const products = async () =>
    (await env.DB.prepare("SELECT COUNT(*) AS n FROM products").first<number>(
      "n",
    ))!;
  const before = await products();
  for (let run = 0; run < 2; run++)
    await env.DB.batch(
      taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
    );
  const slugs = [...TAXONOMY_PARENTS, ...TAXONOMY_LEAVES].map((c) => c.slug);
  const rows = (
    await env.DB.prepare(
      "SELECT slug,COUNT(*) AS n FROM categories WHERE slug IN (SELECT value FROM json_each(?)) GROUP BY slug",
    )
      .bind(JSON.stringify(slugs))
      .all<{ slug: string; n: number }>()
  ).results;
  expect(rows.map((r) => r.slug).sort()).toEqual([...slugs].sort());
  expect(rows.every((r) => r.n === 1)).toBe(true);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM category_aliases a JOIN categories c ON c.id=a.category_id WHERE c.slug='ground-beef' AND a.alias='mince'",
    ).first("n"),
  ).toBe(1);
  expect(await products()).toBe(before);
});
