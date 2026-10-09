import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { taxonomyServices } from "../../server/taxonomy/infrastructure/composition";
import { catalogService } from "../../server/catalog/infrastructure/composition";
import { communityServices } from "../../server/community/infrastructure/composition";
import { TaxonomyService } from "../../server/taxonomy/application/taxonomy-service";
import { D1TaxonomyRepository } from "../../server/taxonomy/infrastructure/d1-taxonomy-repository";
import { ModerationRepository } from "../../server/community/infrastructure/moderation-repository";
import { moderationDecisions } from "../../server/moderation/infrastructure/composition";
import { ratingsService } from "../../server/ratings/infrastructure/composition";
import { rebuildSearchIndex } from "../../server/catalog/infrastructure/search-index";
import {
  TAXONOMY_LEAVES,
  TAXONOMY_GROUPS,
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
  // A root, an aisle and a shelf: category proposals choose a shelf.
  const [R, A, SH] = [`root-${s}`, `aisle-${s}`, `shelf-${s}`];
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
      "INSERT INTO categories(id,parent_id,slug,name,is_rankable,created_at,updated_at) VALUES(?,NULL,?,?,0,1,1),(?,?,?,?,0,1,1),(?,?,?,?,0,1,1)",
    ).bind(R, R, `Food ${s}`, A, R, A, `Aisle ${s}`, SH, A, SH, `Shelf ${s}`),
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
  return { f, s, D, S, C, R, A, SH, P2, P3, V2, V3, users };
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
  // A market-scoped donor alias moves with its scope.
  await env.DB.prepare(
    "INSERT INTO category_aliases(id,category_id,country_id,alias,created_at) VALUES(?,?,?,?,1)",
  )
    .bind(id(), w.D, w.f.countryId, `beef mince ${w.s}`)
    .run();
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
  expect(survivor.aliases.map((a) => a.alias)).toContain(`Minced ${w.s}`);
  expect(survivor.aliases.map((a) => a.alias)).toContain(`mince ${w.s}`);
  expect(survivor.aliases).toContainEqual({
    alias: `beef mince ${w.s}`,
    country: "US",
    displayName: false,
  });
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
    (await service.tree(operator)).categories
      .find((c) => c.id === w.S)!
      .aliases.map((a) => a.alias),
  ).not.toContain(`beef mince ${w.s}`);
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
  // Aliases added on edit get creation's duplicate check, and a held alias's
  // market scope round-trips through the tree.
  await expect(
    service.update(operator, id(), created.categoryId, {
      expectedRevision: current.revision,
      aliases: [{ alias: `mince ${w.s}` }],
      note,
    }),
  ).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
  await service.update(operator, id(), created.categoryId, {
    expectedRevision: current.revision,
    aliases: [{ alias: `spanish sausage ${w.s}`, country: "US" }],
    note,
  });
  const scoped = (await service.tree(operator)).categories.find(
    (c) => c.id === created.categoryId,
  )!;
  expect(scoped.aliases).toEqual([
    { alias: `spanish sausage ${w.s}`, country: "US", displayName: false },
  ]);
  const renamed = (await service.update(operator, id(), created.categoryId, {
    expectedRevision: scoped.revision,
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
  const home = await catalogService(env).home(
    await catalogService(env).market("us"),
  );
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
      shelfId: w.SH,
      country: "US",
      explanation: "Shoppers look for this conventional food.",
    }),
  ).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
  await expect(
    service.propose(contributor, id(), {
      name: `Phone cases ${w.s}`,
      shelfId: w.SH,
      country: "US",
      explanation: "Not food at all [fake:food_reference=NO]",
    }),
  ).rejects.toMatchObject({ code: "PROPOSAL_NEEDS_CHANGES" });
  const proposal = await service.propose(contributor, id(), {
    name: `Bratwurst ${w.s}`,
    shelfId: w.SH,
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
    shelfId: w.SH,
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
    (await service.tree(operator)).categories
      .find((c) => c.id === w.S)!
      .aliases.map((a) => a.alias),
  ).toContain(`Hamburger meat ${w.s}`);
});

it("reverses a merge only after later edits, and rechecks proposed names when deciding", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
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
  // A later edit rewrites the survivor's aliases, so it is undone first.
  const edited = (await service.update(operator, id(), w.S, {
    expectedRevision: (await service.tree(operator)).categories.find(
      (c) => c.id === w.S,
    )!.revision,
    name: `Ground meat ${w.s}`,
    note,
  })) as { actionId: string };
  await expect(
    service.reverseMerge(operator, id(), merged.mergeId, note),
  ).rejects.toMatchObject({ code: "REVERSAL_CONFLICT" });
  await service.reverseUpdate(operator, id(), edited.actionId, note);
  expect(
    await service.reverseMerge(operator, id(), merged.mergeId, note),
  ).toMatchObject({ state: "reversed" });
  expect(
    (await service.tree(operator)).categories
      .find((c) => c.id === w.S)!
      .aliases.map((a) => a.alias),
  ).not.toContain(`mince ${w.s}`);
  // A name claimed by another category after submission blocks acceptance.
  const proposal = await service.propose(
    { id: w.users[0]!, accountState: "active", administrator: false },
    id(),
    {
      name: `Kielbasa ${w.s}`,
      shelfId: w.SH,
      country: "US",
      explanation: "Plant-based kielbasa is sold in many grocery stores.",
      aliases: [`polska ${w.s}`],
    },
  );
  await service.create(operator, id(), {
    name: `Polish sausage ${w.s}`,
    isRankable: true,
    aliases: [`polska ${w.s}`],
    note,
  });
  await expect(
    service.decideProposal(operator, id(), proposal.id, {
      decision: "accept",
      expectedRevision: (await service.proposalDetail(operator, proposal.id))
        .revision,
      note: "Distinct reference food.",
    }),
  ).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
});

it("enforces the daily category proposal allowance before any automated check", async () => {
  const w = await world();
  const contributor = {
    id: w.users[2]!,
    accountState: "active",
    administrator: false,
  };
  const service = taxonomy();
  for (const name of ["Tempeh bacon", "Seitan ribs", "Jackfruit pulled pork"])
    await service.propose(contributor, id(), {
      name: `${name} ${w.s}`,
      shelfId: w.SH,
      country: "US",
      explanation: "A common conventional food with several alternatives.",
    });
  const decisions = async () =>
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM moderation_decisions WHERE user_id=?",
    )
      .bind(contributor.id)
      .first<number>("n");
  const before = await decisions();
  await expect(
    service.propose(contributor, id(), {
      name: `Vegan schnitzel ${w.s}`,
      shelfId: w.SH,
      country: "US",
      explanation: "A common conventional food with several alternatives.",
    }),
  ).rejects.toMatchObject({ code: "PROPOSAL_LIMIT" });
  expect(await decisions()).toBe(before);
});

it("keeps feature sets, edit reversals and later merges consistent", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  const service = taxonomy();
  const revisionOf = async (cid: string) =>
    (await service.tree(operator)).categories.find((c) => c.id === cid)!
      .revision;
  // A retired category cannot be featured.
  await env.DB.prepare("UPDATE categories SET is_active=0 WHERE id=?")
    .bind(w.C)
    .run();
  await expect(
    service.setFeatures(operator, id(), { categoryIds: [w.S, w.C], note }),
  ).rejects.toMatchObject({ code: "INVALID_FEATURES" });
  // Reversing a rename cannot restore a name another category claimed since.
  const renamed = (await service.update(operator, id(), w.S, {
    expectedRevision: await revisionOf(w.S),
    name: `Plant mince ${w.s}`,
    note,
  })) as { actionId: string };
  await service.create(operator, id(), {
    name: `Ground ${w.s}`,
    isRankable: true,
    note,
  });
  await expect(
    service.reverseUpdate(operator, id(), renamed.actionId, note),
  ).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
  // An edit made before a merge waits until that merge is reversed.
  const donorEdit = (await service.update(operator, id(), w.D, {
    expectedRevision: await revisionOf(w.D),
    aliases: [{ alias: `mince ${w.s}` }, { alias: `minced meat ${w.s}` }],
    note,
  })) as { actionId: string };
  const merged = await service.merge(operator, id(), {
    donorId: w.D,
    survivorId: w.S,
    donorRevision: await revisionOf(w.D),
    survivorRevision: await revisionOf(w.S),
    note,
  });
  await expect(
    service.reverseUpdate(operator, id(), donorEdit.actionId, note),
  ).rejects.toMatchObject({ code: "REVERSAL_CONFLICT" });
  await service.reverseMerge(operator, id(), merged.mergeId, note);
  await service.reverseUpdate(operator, id(), donorEdit.actionId, note);
  expect(
    (await service.tree(operator)).categories
      .find((c) => c.id === w.D)!
      .aliases.map((a) => a.alias),
  ).toEqual([`mince ${w.s}`]);
});

it("retries a merge's derived rebuild until it succeeds and bumps both revisions", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  const tree = await taxonomy().tree(operator);
  const revision = (cid: string) =>
    tree.categories.find((c) => c.id === cid)!.revision;
  // The merge commits, then its derived rebuild fails.
  const failing = new TaxonomyService(
    new D1TaxonomyRepository(new ModerationRepository(env.DB), id),
    moderationDecisions(testEnv, id),
    {
      rebuildVersions: (ids) => ratingsService(testEnv).rebuildVersions(ids),
      rebuildSearch: async () => {},
      refreshTrending: async () => {
        throw new Error("Derived rebuild unavailable.");
      },
      invalidate: async () => {},
    },
    id,
  );
  await expect(
    failing.merge(operator, id(), {
      donorId: w.D,
      survivorId: w.S,
      donorRevision: revision(w.D),
      survivorRevision: revision(w.S),
      note,
    }),
  ).rejects.toThrow("Derived rebuild unavailable.");
  const pending = async () =>
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM community_recovery WHERE prefix LIKE 'merge-derived:%'",
    ).first<number>("n");
  expect(await pending()).toBeGreaterThan(0);
  const after = await taxonomy().tree(operator);
  for (const cid of [w.D, w.S])
    expect(
      after.categories.find((c) => c.id === cid)!.revision,
    ).toBeGreaterThan(revision(cid));
  // Hourly automation retries and clears the marker.
  await taxonomy().continueInterrupted();
  expect(await pending()).toBe(0);
  expect(
    await env.DB.prepare(
      "SELECT COALESCE(SUM(rating_count),0) AS n FROM product_category_stats WHERE category_id=?",
    )
      .bind(w.S)
      .first<number>("n"),
  ).toBe(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM ratings WHERE category_id=? AND is_counted=1",
    )
      .bind(w.S)
      .first<number>("n"),
  );
});

it("fences a parent change against a cycle created after the check", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  // A stale ancestry read stands in for a concurrent re-parenting.
  class StaleAncestry extends D1TaxonomyRepository {
    override async ancestors() {
      return [] as string[];
    }
  }
  const stale = new TaxonomyService(
    new StaleAncestry(new ModerationRepository(env.DB), id),
    moderationDecisions(testEnv, id),
    {
      rebuildVersions: async () => {},
      rebuildSearch: async () => {},
      refreshTrending: async () => {},
      invalidate: async () => {},
    },
    id,
  );
  // C is D's child, so D beneath C would be a cycle.
  await expect(
    stale.update(operator, id(), w.D, {
      expectedRevision: (await taxonomy().tree(operator)).categories.find(
        (c) => c.id === w.D,
      )!.revision,
      parentId: w.C,
      note,
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await env.DB.prepare("SELECT parent_id FROM categories WHERE id=?")
      .bind(w.D)
      .first("parent_id"),
  ).toBeNull();
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
  const slugs = [...TAXONOMY_GROUPS, ...TAXONOMY_LEAVES].map((c) => c.slug);
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

it("seeds the three-level launch tree, countries, allergen lists, display names and features", async () => {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  await rebuildSearchIndex(env.DB);
  const rows = (
    await env.DB.prepare(
      "SELECT c.slug,p.slug AS parent,c.is_rankable AS rankable FROM categories c LEFT JOIN categories p ON p.id=c.parent_id WHERE c.slug IN (SELECT value FROM json_each(?))",
    )
      .bind(
        JSON.stringify(
          [...TAXONOMY_GROUPS, ...TAXONOMY_LEAVES].map((c) => c.slug),
        ),
      )
      .all<{ slug: string; parent: string | null; rankable: number }>()
  ).results;
  const parent = Object.fromEntries(rows.map((r) => [r.slug, r.parent]));
  expect(parent["ground-beef"]).toBe("beef");
  expect(parent.beef).toBe("meat");
  expect(parent.meat).toBe("food");
  expect(parent.eggs).toBe("eggs-shelf");
  expect(parent["eggs-shelf"]).toBe("eggs-aisle");
  expect(parent.cheese).toBe("food");
  const countries = (
    await env.DB.prepare(
      "SELECT iso2 FROM countries WHERE iso2 IN ('US','CA','GB','AU','NZ','IE') AND is_active=1 ORDER BY iso2",
    ).all<{ iso2: string }>()
  ).results.map((r) => r.iso2);
  expect(countries).toEqual(["AU", "CA", "GB", "IE", "NZ", "US"]);
  const allergens = async (iso2: string) =>
    (
      await env.DB.prepare(
        "SELECT ca.allergen_key AS k,COALESCE(ca.label,a.label) AS label FROM country_allergens ca JOIN allergens a ON a.key=ca.allergen_key JOIN countries co ON co.id=ca.country_id WHERE co.iso2=? ORDER BY ca.position",
      )
        .bind(iso2)
        .all<{ k: string; label: string }>()
    ).results;
  expect((await allergens("US")).map((a) => a.k)).toEqual([
    "milk",
    "egg",
    "fish",
    "crustacean",
    "tree_nuts",
    "peanut",
    "wheat",
    "soy",
    "sesame",
  ]);
  expect(await allergens("GB")).toHaveLength(14);
  expect((await allergens("GB")).find((a) => a.k === "soy")!.label).toBe(
    "Soya",
  );
  // Ground Beef is "Beef mince" in the United Kingdom, by name and in search.
  const gb = await catalogService(env).market("gb");
  const us = await catalogService(env).market("us");
  expect(
    (await catalogService(env).category(gb, "ground-beef")).category.name,
  ).toBe("Beef mince");
  expect(
    (await catalogService(env).category(us, "ground-beef")).category.name,
  ).toBe("Ground Beef");
  expect(
    (await catalogService(env).search(gb, "beef mince")).categories.map(
      (c) => c.slug,
    ),
  ).toContain("ground-beef");
  // Aisles and shelves are navigation, never search results.
  const found = (await catalogService(env).search(us, "dairy")).categories.map(
    (c) => c.slug,
  );
  expect(found).not.toContain("dairy");
  expect(found).toContain("milk");
  // Every launch country features the six foods.
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM category_features f JOIN countries co ON co.id=f.country_id WHERE co.iso2='CA'",
    ).first("n"),
  ).toBe(6);
  // The aisle bar places every launch food.
  const page = await catalogService(env).page("ca");
  const foods = page.aisles.flatMap((a) =>
    a.shelves.flatMap((s) => s.foods.map((f) => f.slug)),
  );
  for (const leaf of TAXONOMY_LEAVES) expect(foods).toContain(leaf.slug);
});

it("lets aisles and shelves share a food's name but keeps foods and aliases unique", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  const service = taxonomy();
  // A shelf may share a food's name; groups only need unique sibling names.
  await service.create(operator, id(), {
    name: `Ground ${w.s}`,
    parentId: w.A,
    isRankable: false,
    note,
  });
  await expect(
    service.create(operator, id(), {
      name: `ground ${w.s}`,
      slug: `ground-again-${w.s}`,
      parentId: w.A,
      isRankable: false,
      note,
    }),
  ).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
  // A food may not reuse another food's name or alias.
  await expect(
    service.create(operator, id(), {
      name: `Mince ${w.s}`,
      parentId: w.SH,
      isRankable: true,
      note,
    }),
  ).rejects.toMatchObject({ code: "CATEGORY_EXISTS" });
  // A food may share a group's name.
  await service.create(operator, id(), {
    name: `Shelf ${w.s}`,
    slug: `shelf-food-${w.s}`,
    parentId: w.SH,
    isRankable: true,
    note,
  });
  // Groups take no aliases.
  await expect(
    service.create(operator, id(), {
      name: `Snacks ${w.s}`,
      parentId: w.A,
      isRankable: false,
      aliases: [`nibbles ${w.s}`],
      note,
    }),
  ).rejects.toMatchObject({ code: "GROUP_ALIASES" });
  // Proposals choose a shelf, not an aisle or a food.
  const contributor = {
    id: w.users[1]!,
    accountState: "active",
    administrator: false,
  };
  for (const shelfId of [w.A, w.S])
    await expect(
      service.propose(contributor, id(), {
        name: `Seitan strips ${w.s}`,
        shelfId,
        country: "US",
        explanation: "A common conventional food with several alternatives.",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SHELF" });
  // Homepage features are per country.
  const tree = await service.tree(operator);
  expect(tree.categories.find((c) => c.id === w.SH)).toMatchObject({
    depth: 2,
    outsideDepth: false,
  });
  expect(tree.categories.find((c) => c.id === w.S)).toMatchObject({
    outsideDepth: true,
  });
  await env.DB.prepare("UPDATE countries SET iso2='ZX' WHERE id=?")
    .bind(w.f.otherCountryId)
    .run();
  await service.setFeatures(operator, id(), {
    categoryIds: [w.S],
    country: "ZX",
    note,
  });
  expect(
    (
      await env.DB.prepare(
        "SELECT category_id FROM category_features WHERE country_id=?",
      )
        .bind(w.f.otherCountryId)
        .all<{ category_id: string }>()
    ).results.map((r) => r.category_id),
  ).toEqual([w.S]);
  // A display name must be country-scoped.
  await expect(
    env.DB.prepare(
      "INSERT INTO category_aliases(id,category_id,country_id,alias,is_display_name,created_at) VALUES(?,?,NULL,?,1,1)",
    )
      .bind(id(), w.S, `global name ${w.s}`)
      .run(),
  ).rejects.toThrow(/country-scoped/);
});

it("merges foods that ask different questions and reverses their answers exactly", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  const service = taxonomy();
  const question = (category: string, key: string) => `${key}-${category}`;
  const answer = (user: string, category: string, key: string, score: number) =>
    env.DB.prepare(
      "INSERT INTO rating_dimension_values(rating_id,dimension_id,score,created_at,updated_at) VALUES(?,?,?,1,1)",
    ).bind(
      `r-${user}-${w.f.versionId}-${category}`,
      question(category, key),
      score,
    );
  const [u0, u1, u2] = w.users as [string, string, string];
  await env.DB.batch([
    ...(
      [
        [w.D, "taste"],
        [w.D, "smell"],
        [w.S, "taste"],
        [w.S, "texture"],
      ] as const
    ).map(([category, key], index) =>
      env.DB.prepare(
        "INSERT INTO category_rating_dimensions(id,category_id,key,label,sort_order,is_active,created_at,updated_at) VALUES(?,?,?,?,?,1,1,1)",
      ).bind(question(category, key), category, key, key, index),
    ),
    // u0's donor rating loses; u1's donor rating wins (its survivor rating
    // swaps into the donor); u2's donor rating simply moves.
    answer(u0, w.D, "taste", 2),
    answer(u0, w.D, "smell", 1),
    answer(u0, w.S, "taste", 4),
    answer(u0, w.S, "texture", 5),
    answer(u1, w.D, "taste", 5),
    answer(u1, w.D, "smell", 4),
    answer(u1, w.S, "texture", 2),
    answer(u2, w.D, "smell", 3),
  ]);
  const answers = async () =>
    JSON.stringify(
      (
        await env.DB.prepare(
          "SELECT v.rating_id,r.category_id,d.key,v.dimension_id,v.score FROM rating_dimension_values v JOIN ratings r ON r.id=v.rating_id JOIN category_rating_dimensions d ON d.id=v.dimension_id WHERE r.category_id IN (?,?) ORDER BY v.rating_id,d.key",
        )
          .bind(w.D, w.S)
          .all()
      ).results,
    );
  const questions = async (category: string) =>
    (
      await env.DB.prepare(
        "SELECT key,is_active FROM category_rating_dimensions WHERE category_id=? ORDER BY key",
      )
        .bind(category)
        .all<{ key: string; is_active: number }>()
    ).results.map((q) => `${q.key}:${q.is_active}`);
  const before = await answers();
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
  // Each food gains a retired question for the other's keys, and every
  // answer sits on its rating's current food under the same key.
  expect(await questions(w.S)).toEqual(["smell:0", "taste:1", "texture:1"]);
  expect(await questions(w.D)).toEqual(["smell:1", "taste:1", "texture:0"]);
  const moved = JSON.parse(await answers()) as {
    category_id: string;
    dimension_id: string;
    key: string;
  }[];
  expect(moved).toHaveLength(8);
  for (const row of moved)
    expect(row.dimension_id).toBe(
      row.dimension_id.startsWith("dimension-")
        ? `dimension-${row.category_id}-${row.key}`
        : question(row.category_id, row.key),
    );
  // Survivor details count the winning ratings only.
  await ratingsService(testEnv).rebuildVersions([w.f.versionId]);
  expect(
    (
      await env.DB.prepare(
        "SELECT d.key,s.answer_count,s.answer_sum FROM product_category_dimension_stats s JOIN category_rating_dimensions d ON d.id=s.dimension_id WHERE s.product_version_id=? AND s.category_id=? ORDER BY d.key",
      )
        .bind(w.f.versionId, w.S)
        .all()
    ).results,
  ).toEqual([
    { key: "smell", answer_count: 2, answer_sum: 7 },
    { key: "taste", answer_count: 2, answer_sum: 9 },
    { key: "texture", answer_count: 1, answer_sum: 5 },
  ]);

  const reversed = await service.reverseMerge(
    operator,
    id(),
    merged.mergeId,
    "Reversed: these are different foods.",
  );
  expect(reversed).toMatchObject({ state: "reversed" });
  expect(await answers()).toBe(before);
  expect(await questions(w.S)).toEqual(["taste:1", "texture:1"]);
  expect(await questions(w.D)).toEqual(["smell:1", "taste:1"]);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});

it("starts foods with Taste and Texture and edits their questions reversibly", async () => {
  const w = await world();
  const operator = {
    id: w.users[5]!,
    accountState: "active",
    administrator: true,
  };
  const service = taxonomy();
  const created = await service.create(operator, id(), {
    name: `Halloumi ${w.s}`,
    parentId: w.SH,
    isRankable: true,
    aliases: [],
    note,
  });
  const food = async () =>
    (await service.tree(operator)).categories.find(
      (c) => c.id === created.categoryId,
    )!;
  expect((await food()).dimensions).toEqual([
    { key: "taste", label: "Taste", description: null, active: true },
    { key: "texture", label: "Texture", description: null, active: true },
  ]);
  // Groups ask nothing.
  const shelf = await service.create(operator, id(), {
    name: `Brined ${w.s}`,
    parentId: w.A,
    isRankable: false,
    aliases: [],
    note,
  });
  expect(
    (await service.tree(operator)).categories.find(
      (c) => c.id === shelf.categoryId,
    )!.dimensions,
  ).toEqual([]);

  const edit = async (
    dimensions: {
      key: string;
      label: string;
      description?: string | null;
      active: boolean;
    }[],
  ) =>
    service.setDimensions(operator, id(), created.categoryId, {
      expectedRevision: (await food()).revision,
      dimensions,
      note,
    });
  await expect(
    edit([{ key: "taste", label: "Taste", active: true }]),
  ).rejects.toMatchObject({ code: "INVALID_DIMENSIONS" });
  await expect(
    edit([
      { key: "taste", label: "Taste", active: true },
      { key: "texture", label: "taste", active: true },
    ]),
  ).rejects.toMatchObject({ code: "INVALID_DIMENSIONS" });
  const saved = await edit([
    { key: "squeak", label: "Squeak", active: true },
    { key: "texture", label: "Bite", active: true },
    { key: "taste", label: "Taste", active: false },
  ]);
  expect((await food()).dimensions).toEqual([
    { key: "squeak", label: "Squeak", description: null, active: true },
    { key: "texture", label: "Bite", description: null, active: true },
    { key: "taste", label: "Taste", description: null, active: false },
  ]);
  await expect(
    service.setDimensions(operator, id(), created.categoryId, {
      expectedRevision: 0,
      dimensions: [{ key: "taste", label: "Taste", active: true }],
      note,
    }),
  ).rejects.toMatchObject({ code: "STALE_CATEGORY" });

  await service.reverseUpdate(operator, id(), saved.actionId, note);
  // The added key stays, retired; everything else is as before.
  expect((await food()).dimensions).toEqual([
    { key: "taste", label: "Taste", description: null, active: true },
    { key: "texture", label: "Texture", description: null, active: true },
    { key: "squeak", label: "Squeak", description: null, active: false },
  ]);
});
