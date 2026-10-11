import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { communityServices } from "../../server/community/infrastructure/composition";
import { taxonomyServices } from "../../server/taxonomy/infrastructure/composition";
import { submissionInput } from "../../server/community/domain/contracts";
import { taxonomySeedStatements } from "../../db/seed/taxonomy";

const id = () => crypto.randomUUID();
const tag = () => crypto.randomUUID().replaceAll("-", "").slice(0, 8);
const note = "Reviewed the suggested food for the test.";
const testEnv = {
  ...env,
  APP_ENV: "local",
  MODERATION_PROVIDER: "fake",
  RANKING_PRIOR_MEAN: "3.5",
  RANKING_PRIOR_STRENGTH: "10",
} as unknown as Cloudflare.Env;
const photo = () =>
  Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0));

async function world() {
  await env.DB.batch(
    taxonomySeedStatements(id, Date.now()).map((sql) => env.DB.prepare(sql)),
  );
  const users = [`contrib-${id()}`, `operator-${id()}`];
  await env.DB.batch(
    users.flatMap((user) => [
      env.DB.prepare(
        "INSERT INTO user(id,name,email,created_at,updated_at) VALUES(?,?,?,1,1)",
      ).bind(user, "Test identity", `${user}@example.invalid`),
      env.DB.prepare(
        "INSERT INTO profiles(user_id,handle,created_at,updated_at) VALUES(?,?,1,1)",
      ).bind(user, user),
    ]),
  );
  const shelf = (await env.DB.prepare(
    "SELECT id FROM categories WHERE slug='pork'",
  ).first("id")) as string;
  const bacon = (await env.DB.prepare(
    "SELECT id FROM categories WHERE slug='bacon'",
  ).first("id")) as string;
  const community = communityServices(testEnv, id);
  return {
    community,
    taxonomy: taxonomyServices(testEnv, id),
    contributor: {
      id: users[0]!,
      accountState: "active",
      administrator: false,
    },
    operator: { id: users[1]!, accountState: "active", administrator: true },
    shelf,
    bacon,
  };
}
type World = Awaited<ReturnType<typeof world>>;
async function submit(w: World, food: string, extra: object = {}) {
  const input = submissionInput.parse({
    name: `Brats ${tag()}`,
    brand: `Grill ${tag()}`,
    country: "GB",
    categoryIds: [],
    newFood: { name: food, shelfId: w.shelf, aliases: [`${food} links`] },
    imageSlots: ["front"],
    rating: 4,
    ...extra,
  });
  const checked = await w.community.submissions.preflight(
    w.contributor,
    id(),
    input,
  );
  if (!checked.receiptId) return { input, checked, result: null };
  await w.community.media.upload(w.contributor, {
    receiptId: checked.receiptId,
    slot: "front",
    idempotencyKey: id(),
    bytes: photo(),
  });
  const result = await w.community.submissions.finalize(
    w.contributor,
    checked.receiptId,
    input,
  );
  return { input, checked, result };
}
const pending = (submissionId: string) =>
  env.DB.prepare(
    "SELECT p.category_proposal_id AS proposalId,p.resolution_note AS note,s.state,s.product_id AS productId FROM pending_submissions p JOIN submission_receipts s ON s.id=p.submission_id WHERE p.submission_id=?",
  )
    .bind(submissionId)
    .first<{
      proposalId: string | null;
      note: string | null;
      state: string;
      productId: string | null;
    }>();
const decide = async (
  w: World,
  proposalId: string,
  decision: Record<string, unknown>,
) =>
  w.taxonomy.decideProposal(w.operator, id(), proposalId, {
    expectedRevision: (await w.taxonomy.proposalDetail(w.operator, proposalId))
      .revision,
    note,
    ...decision,
  });

it("holds a product with its suggested food and publishes it once the food is accepted", async () => {
  const w = await world();
  const food = `Bratwurst ${tag()}`;
  const { input, checked, result } = await submit(w, food);
  expect(result).toMatchObject({ decision: "NEEDS_REVIEW" });
  const held = await pending(checked.receiptId!);
  expect(held?.proposalId).toBe(`${checked.receiptId}_food`);
  // Moderators see the product is waiting on its food.
  expect(
    await w.community.moderation.detail(
      w.operator,
      "submission",
      checked.receiptId!,
    ),
  ).toMatchObject({
    pendingFood: { id: held!.proposalId, name: food, status: "pending" },
  });
  const detail = await w.taxonomy.proposalDetail(w.operator, held!.proposalId!);
  expect(detail).toMatchObject({ country: "GB" });
  expect(detail.waitingProducts).toEqual([
    expect.objectContaining({ submissionId: checked.receiptId }),
  ]);
  // The product cannot publish before its food is decided.
  await expect(
    w.community.submissions.approve(
      w.operator,
      checked.receiptId!,
      input,
      0,
      note,
    ),
  ).rejects.toMatchObject({ code: "FOOD_PENDING" });
  // Accepting the food as a group would strand the waiting product.
  await expect(
    decide(w, held!.proposalId!, { decision: "accept", isRankable: false }),
  ).rejects.toMatchObject({ code: "FOOD_HAS_WAITING_PRODUCTS" });
  const accepted = (await decide(w, held!.proposalId!, {
    decision: "accept",
  })) as { categoryId: string };
  const after = await pending(checked.receiptId!);
  expect(after?.state).toBe("published");
  // Published in the new food, which is on in the United Kingdom only.
  expect(
    (
      await env.DB.prepare(
        "SELECT category_id FROM product_categories WHERE product_id=?",
      )
        .bind(after!.productId)
        .all<{ category_id: string }>()
    ).results.map((r) => r.category_id),
  ).toEqual([accepted.categoryId]);
  expect(
    (
      await env.DB.prepare(
        "SELECT co.iso2 FROM category_countries cc JOIN countries co ON co.id=cc.country_id WHERE cc.category_id=?",
      )
        .bind(accepted.categoryId)
        .all<{ iso2: string }>()
    ).results.map((r) => r.iso2),
  ).toEqual(["GB"]);
  // The rating given with the product is saved once it publishes.
  expect(
    await env.DB.prepare(
      "SELECT r.overall_similarity FROM ratings r JOIN product_versions v ON v.id=r.product_version_id WHERE v.product_id=? AND r.user_id=?",
    )
      .bind(after!.productId, w.contributor.id)
      .first("overall_similarity"),
  ).toBe(4);
});

it("continues with an existing food on an alias, and asks for another on a rejection", async () => {
  const w = await world();
  const aliased = await submit(w, `Breakfast rashers ${tag()}`);
  const aliasId = (await pending(aliased.checked.receiptId!))!.proposalId!;
  await decide(w, aliasId, { decision: "alias", aliasOf: w.bacon });
  const published = await pending(aliased.checked.receiptId!);
  expect(published?.state).toBe("published");
  expect(
    await env.DB.prepare(
      "SELECT category_id FROM product_categories WHERE product_id=?",
    )
      .bind(published!.productId)
      .first("category_id"),
  ).toBe(w.bacon);

  const rejected = await submit(w, `Novelty ${tag()}`);
  const rejectId = (await pending(rejected.checked.receiptId!))!.proposalId!;
  await decide(w, rejectId, { decision: "reject" });
  const asked = await pending(rejected.checked.receiptId!);
  expect(asked).toMatchObject({ state: "review" });
  expect(asked?.note).toMatch(/wasn’t added.*Choose an existing food/);
  // Answering with the same rejected food is refused; an existing food is
  // held for an operator, as every follow-up is.
  const followUp = {
    submissionId: rejected.checked.receiptId!,
    expectedRevision: 1,
  };
  const again = await w.community.submissions.preflight(w.contributor, id(), {
    ...rejected.input,
    followUp,
  });
  expect(again).toMatchObject({ decision: "NEEDS_CHANGES" });
  const { newFood: _, ...rest } = rejected.input;
  const revised = await w.community.submissions.preflight(
    w.contributor,
    id(),
    submissionInput.parse({ ...rest, categoryIds: [w.bacon], followUp }),
  );
  expect(revised.decision).toBe("NEEDS_REVIEW");
});

it("carries an undecided food through a follow-up and keeps the daily allowance", async () => {
  const w = await world();
  const food = `Frankfurters ${tag()}`;
  const first = await submit(w, food);
  const proposalId = (await pending(first.checked.receiptId!))!.proposalId!;
  // An operator asks for something else before deciding the food.
  await w.community.moderation.decide(
    w.operator,
    id(),
    "submission",
    first.checked.receiptId!,
    {
      decision: "follow_up",
      expectedRevision: 0,
      note: "Please add a clearer front photo.",
      effect: "none",
    },
  );
  const revision = await submit(w, food, {
    name: first.input.name,
    brand: first.input.brand,
    followUp: { submissionId: first.checked.receiptId!, expectedRevision: 1 },
  });
  expect(revision.result).toMatchObject({ decision: "NEEDS_REVIEW" });
  expect((await pending(revision.checked.receiptId!))?.proposalId).toBe(
    proposalId,
  );
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM category_proposals WHERE submitted_by=?",
    )
      .bind(w.contributor.id)
      .first("n"),
  ).toBe(1);
  // Two more suggestions use up the day's three; a fourth is refused.
  await submit(w, `Kielbasa ${tag()}`);
  await submit(w, `Chorizo ${tag()}`);
  const fourth = await submit(w, `Salami ${tag()}`);
  expect(fourth.checked).toMatchObject({
    decision: "NEEDS_CHANGES",
    reasons: [expect.stringMatching(/most foods allowed today/)],
  });
});

it("applies the contributor's rating, store and allergen declaration once the product is live", async () => {
  const w = await world();
  const ranked = w.community;
  const gb = (await env.DB.prepare(
    "SELECT id FROM countries WHERE iso2='GB'",
  ).first("id")) as string;
  const store = `store-${tag()}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO retailers(id,canonical_name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
    ).bind(store, `Corner Shop ${store}`, store, store),
    env.DB.prepare(
      "INSERT INTO retailer_markets(retailer_id,country_id,is_active,created_at,updated_at) VALUES(?,?,1,1,1)",
    ).bind(store, gb),
  ]);
  const input = submissionInput.parse({
    name: `Rashers ${tag()}`,
    brand: `Smoky ${tag()}`,
    country: "GB",
    categoryIds: [w.bacon],
    imageSlots: ["front", "ingredients"],
    noKnownAnimalIngredients: true,
    rating: 4,
    retailerIds: [store],
    allergens: { status: "declared", contains: ["soy"], mayContain: [] },
  });
  const checked = await ranked.submissions.preflight(
    w.contributor,
    id(),
    input,
  );
  for (const [slot, file] of [
    ["front", env.TEST_IMAGES.jpeg],
    ["ingredients", env.TEST_IMAGES.png],
  ] as const)
    await ranked.media.upload(w.contributor, {
      receiptId: checked.receiptId!,
      slot,
      idempotencyKey: id(),
      bytes: Uint8Array.from(atob(file), (c) => c.charCodeAt(0)),
    });
  const published = await ranked.submissions.finalize(
    w.contributor,
    checked.receiptId!,
    input,
  );
  expect(published).toMatchObject({ decision: "READY" });
  const productId = (published as { productId: string }).productId;
  // The rating counts like any other, once.
  expect(
    await env.DB.prepare(
      "SELECT r.overall_similarity AS score,r.is_counted AS counted,s.rating_count AS n FROM ratings r JOIN product_versions v ON v.id=r.product_version_id LEFT JOIN product_category_stats s ON s.product_version_id=v.id AND s.category_id=r.category_id WHERE v.product_id=? AND r.user_id=?",
    )
      .bind(productId, w.contributor.id)
      .all(),
  ).toMatchObject({ results: [{ score: 4, counted: 1, n: 1 }] });
  // The store is commonly found at, confirmed by the contributor.
  expect(
    await env.DB.prepare(
      "SELECT status,confirmation_count AS n FROM product_retailers WHERE product_id=? AND retailer_id=?",
    )
      .bind(productId, store)
      .first(),
  ).toEqual({ status: "active", n: 1 });
  // The declaration is an ordinary proposal citing the label photo (tier 2).
  expect(
    await env.DB.prepare(
      "SELECT change_type AS kind,risk_tier AS tier,submitted_by AS user,json_extract(proposed_data,'$.citedImageId') IS NOT NULL AS cited FROM edit_proposals WHERE target_id=?",
    )
      .bind(productId)
      .first(),
  ).toEqual({ kind: "allergens", tier: 2, user: w.contributor.id, cited: 1 });
  // Nothing is applied twice.
  expect(await ranked.extras.apply(checked.receiptId!)).toBe(false);
  expect(await ranked.extras.sweep()).toBe(0);
});
