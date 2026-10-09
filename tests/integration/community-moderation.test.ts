import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture, testMarket } from "./fixtures";
import { communityServices } from "../../server/community/infrastructure/composition";
import {
  changeInput,
  reportInput,
  retailerInput,
} from "../../server/community/domain/contracts";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { catalogService } from "../../server/catalog/infrastructure/composition";

const id = () => crypto.randomUUID();
const evidence = {
  urls: ["https://example.com/ingredients"],
  imageIds: [],
  note: "Manufacturer ingredients checked against the current formula.",
};
async function fixture() {
  const f = await catalogFixture(env.DB, 2);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const services = communityServices(env, id),
    actor = { ...f.users[0]!, administrator: false },
    admin = { ...f.users[1]!, administrator: true };
  return { f, ...services, actor, admin };
}
const decision = (revision: number) => ({
  decision: "accept" as const,
  expectedRevision: revision,
  note: "Evidence reviewed; catalog change accepted.",
  effect: "none" as const,
});

it("deduplicates reports, prioritizes ingredient concerns, and requires an operator decision to apply Under Review", async () => {
  const { f, contributions, moderation, repository, actor, admin } =
    await fixture();
  const input = reportInput.parse({
    targetType: "product",
    targetId: f.productId,
    reason: "ingredient_concern",
    note: "Possible milk ingredient listed.",
    evidenceUrls: ["https://example.com/milk"],
  });
  const a = await contributions.report(actor, id(), input),
    b = await contributions.report(actor, id(), {
      ...input,
      evidenceUrls: ["https://example.com/label"],
    });
  expect(a.id).toBe(b.id);
  // Repeat reports keep the original explanation and add new ones.
  await contributions.report(actor, id(), { ...input, note: "" });
  await contributions.report(actor, id(), {
    ...input,
    note: "A second label photo lists whey.",
  });
  expect((await repository.report(a.id))!.note).toBe(
    "Possible milk ingredient listed.\n\nA second label photo lists whey.",
  );
  expect((await repository.snapshot(f.productId)).veganStatus).toBe(
    "appears_vegan",
  );
  const report = (await repository.report(a.id))!;
  expect(JSON.parse(report.evidence_data)).toEqual(
    expect.arrayContaining([
      "https://example.com/milk",
      "https://example.com/label",
    ]),
  );
  expect((await moderation.inbox(admin, null)).items[0]).toMatchObject({
    id: a.id,
    priority: 1,
  });
  await expect(moderation.inbox(actor, null)).rejects.toMatchObject({
    status: 403,
  });
  const oldRatingSnapshot = (await new D1RatingsRepository(env.DB).snapshot(
    f.versionId,
  ))!;
  const product = await repository.snapshot(f.productId),
    key = id();
  const resolve = {
    decision: "resolve" as const,
    expectedRevision: report.revision,
    expectedProductRevision: product.revision,
    note: "Operator assessed the ingredient concern and requests evidence.",
    effect: "under_review" as const,
  };
  const action = await moderation.decide(admin, key, "report", a.id, resolve);
  expect(await moderation.decide(admin, key, "report", a.id, resolve)).toEqual(
    action,
  );
  const updated = await repository.snapshot(f.productId);
  expect(updated.veganStatus).toBe("under_review");
  // Contributors see that the classification was reviewed, never by whom.
  expect(updated.classification?.reviewedBy).toBe(admin.id);
  const view = await contributions.product(actor, f.productId);
  expect(view.classification).toMatchObject({
    veganStatus: "under_review",
    reviewed: true,
  });
  expect(JSON.stringify(view)).not.toContain(admin.id);
  expect(
    JSON.stringify(await moderation.detail(actor, "report", a.id)),
  ).not.toContain(admin.id);
  expect(
    await new D1RatingsRepository(env.DB).commit(
      oldRatingSnapshot,
      { kind: "rebuild" },
      [],
      Date.now(),
    ),
  ).toBe(false);
  await expect(
    moderation.decide(admin, id(), "report", a.id, resolve),
  ).rejects.toMatchObject({ status: 409 });
  if (!("actionId" in action)) throw new Error("Expected moderation action");
  await moderation.reverse(admin, id(), action.actionId, {
    expectedRevision: updated.revision,
    note: "Ingredient concern resolved after manufacturer clarification.",
  });
  expect((await repository.snapshot(f.productId)).veganStatus).toBe(
    "appears_vegan",
  );
});

it("preserves formula contributions through reformulation and reversal and stores approximate dates", async () => {
  const { f, contributions, moderation, repository, actor, admin } =
    await fixture();
  const before = await repository.snapshot(f.productId);
  const proposed = await contributions.propose(
    actor,
    id(),
    changeInput.parse({
      kind: "reformulation",
      productId: f.productId,
      expectedRevision: before.revision,
      evidence,
      versionLabel: "New recipe",
      effectiveDate: "2026-09",
      veganStatus: "vegan",
      manufacturerLabel: "plant_based",
    }),
  );
  const row = (await repository.proposal(proposed.id))!;
  const accepted = await moderation.decide(
    admin,
    id(),
    "proposal",
    proposed.id,
    decision(row.updated_at),
  );
  const after = await repository.snapshot(f.productId);
  expect(after.versionId).not.toBe(f.versionId);
  expect(
    await env.DB.prepare(
      "SELECT effective_date,effective_date_precision FROM product_versions WHERE id=?",
    )
      .bind(after.versionId)
      .first(),
  ).toEqual({ effective_date: "2026-09", effective_date_precision: "month" });
  await env.DB.prepare(
    "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,5,1,1)",
  )
    .bind(id(), actor.id, after.versionId, f.categories[0])
    .run();
  if (!("actionId" in accepted)) throw new Error("Expected moderation action");
  await moderation.reverse(admin, id(), accepted.actionId, {
    expectedRevision: after.revision,
    note: "Manufacturer confirmed the reported change was not material.",
  });
  expect((await repository.snapshot(f.productId)).versionId).toBe(f.versionId);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM ratings WHERE product_version_id=?",
    )
      .bind(after.versionId)
      .first("n"),
  ).toBe(1);
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM product_versions WHERE product_id=?",
    )
      .bind(f.productId)
      .first("n"),
  ).toBe(2);
});

it("archives duplicates without transferring contributions or changing the survivor and reverses the redirect", async () => {
  const { f, moderation, repository, actor, admin } = await fixture();
  const catalog = catalogService(env);
  const survivorId = id(),
    version = id();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO products(id,country_id,name,slug,created_at,updated_at) VALUES(?,?,?, ?,1,1)",
    ).bind(survivorId, f.countryId, "Survivor", survivorId),
    env.DB.prepare(
      "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,1,1,1)",
    ).bind(version, survivorId),
    env.DB.prepare(
      "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,4,1,1)",
    ).bind(id(), actor.id, f.versionId, f.categories[0]),
  ]);
  const survivor = await repository.snapshot(survivorId),
    donor = await repository.snapshot(f.productId);
  const accepted = await moderation.consolidate(admin, id(), {
    donorId: donor.id,
    survivorId,
    donorRevision: donor.revision,
    survivorRevision: survivor.revision,
    note: "Same product, package size variation only.",
  });
  expect(await repository.snapshot(survivorId)).toEqual(survivor);
  expect(
    await catalog.canonicalRedirect(testMarket(f.countryId), donor.slug),
  ).toMatchObject({
    id: survivorId,
  });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM ratings WHERE product_version_id=?",
    )
      .bind(f.versionId)
      .first("n"),
  ).toBe(1);
  const archived = await repository.snapshot(donor.id);
  await moderation.reverse(admin, id(), accepted.actionId, {
    expectedRevision: archived.revision,
    note: "Evidence shows the duplicate was a distinct formula.",
  });
  expect(
    await catalog.canonicalRedirect(testMarket(f.countryId), donor.slug),
  ).toBeNull();
  expect((await repository.snapshot(donor.id)).lifecycleStatus).toBe("active");
});

it("accepts canonical retailer aliases and keeps one current contributor stance without automatic removal", async () => {
  const {
    f,
    contributions,
    contributionRepository,
    moderation,
    repository,
    actor,
    admin,
  } = await fixture();
  const retailer = await contributions.proposeRetailer(
    actor,
    id(),
    retailerInput.parse({
      name: "Green Mart",
      websiteUrl: "https://example.com",
      aliases: ["Green-Mart"],
      country: "US",
      note: "National retailer with a public store directory.",
    }),
  );
  const proposal = (await repository.proposal(retailer.id))!;
  await moderation.decide(
    admin,
    id(),
    "proposal",
    retailer.id,
    decision(proposal.updated_at),
  );
  expect(
    await contributionRepository.retailerExists("Green.Mart"),
  ).toMatchObject({ id: retailer.id });
  await contributions.confirm(actor, id(), {
    productId: f.productId,
    retailerId: retailer.id,
    stance: "confirm",
  });
  await contributions.confirm(actor, id(), {
    productId: f.productId,
    retailerId: retailer.id,
    stance: "confirm",
  });
  // Assert through the production public reader, not a test-only copy.
  const publicRetailer = async () =>
    (
      await catalogService(env).product(
        testMarket(f.countryId),
        f.productId,
        null,
      )
    ).retailers[0];
  expect(await publicRetailer()).toMatchObject({
    contributorCount: 1,
    stale: false,
  });
  await contributions.confirm(actor, id(), {
    productId: f.productId,
    retailerId: retailer.id,
    stance: "not_current",
  });
  expect(await publicRetailer()).toMatchObject({
    contributorCount: 0,
    status: "active",
    stale: true,
  });
  expect((await repository.snapshot(f.productId)).retailers[0]).toMatchObject({
    disagreementCount: 1,
  });
  const concern = await env.DB.prepare(
    "SELECT id FROM edit_proposals WHERE target_id=? AND change_type='retailer_status' AND status='pending'",
  )
    .bind(f.productId)
    .first<string>("id");
  expect(concern).toBeTruthy();
  // Fresh evidence fences the operator's reviewed view, but leaves the concern
  // itself acceptable after a refresh.
  const reviewed = await repository.snapshot(f.productId);
  await contributions.confirm(admin, id(), {
    productId: f.productId,
    retailerId: retailer.id,
    stance: "confirm",
  });
  await expect(
    moderation.decide(admin, id(), "proposal", concern!, {
      ...decision((await repository.proposal(concern!))!.updated_at),
      expectedProductRevision: reviewed.revision,
    }),
  ).rejects.toMatchObject({ code: "STALE_PRODUCT" });
  await moderation.decide(admin, id(), "proposal", concern!, {
    ...decision((await repository.proposal(concern!))!.updated_at),
    expectedProductRevision: (await repository.snapshot(f.productId)).revision,
  });
  expect((await publicRetailer())!.status).toBe("not_current");
});

it("accepts valid comment targets while rejecting missing and hidden comments", async () => {
  const { f, contributions, actor } = await fixture();
  const comment = id();
  await env.DB.prepare(
    "INSERT INTO comments(id,user_id,product_id,product_version_id,body,created_at,updated_at) VALUES(?,?,?,?,'Test comment',1,1)",
  )
    .bind(comment, actor.id, f.productId, f.versionId)
    .run();
  expect(
    await contributions.report(
      actor,
      id(),
      reportInput.parse({
        targetType: "comment",
        targetId: comment,
        reason: "spam",
      }),
    ),
  ).toHaveProperty("id");
  await env.DB.prepare(
    "UPDATE comments SET moderation_state='hidden' WHERE id=?",
  )
    .bind(comment)
    .run();
  await expect(
    contributions.report(
      actor,
      id(),
      reportInput.parse({
        targetType: "comment",
        targetId: comment,
        reason: "spam",
      }),
    ),
  ).rejects.toMatchObject({ status: 404 });
});

it("keeps contributions in their country and proposes a known retailer's market there", async () => {
  const {
    f,
    contributions,
    contributionRepository,
    moderation,
    repository,
    actor,
    admin,
  } = await fixture();
  // The fixture's second country plays Canada.
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='CA'").run();
  await env.DB.prepare("UPDATE countries SET iso2='CA' WHERE id=?")
    .bind(f.otherCountryId)
    .run();
  const name = `Maple Grocer ${id().slice(0, 6)}`;
  const accept = async (proposalId: string) =>
    moderation.decide(
      admin,
      id(),
      "proposal",
      proposalId,
      decision((await repository.proposal(proposalId))!.updated_at),
    );
  const us = await contributions.proposeRetailer(
    actor,
    id(),
    retailerInput.parse({
      name,
      websiteUrl: "https://example.com",
      country: "us",
      note: "Regional retailer with a public store directory.",
    }),
  );
  await accept(us.id);
  // The same retailer proposed for Canada becomes a market proposal.
  const ca = await contributions.proposeRetailer(
    actor,
    id(),
    retailerInput.parse({
      name,
      websiteUrl: "https://example.com",
      country: "CA",
      note: "The same retailer also operates stores in Canada.",
    }),
  );
  expect(await repository.proposal(ca.id)).toMatchObject({
    target_id: us.id,
    change_type: "retailer_market",
  });
  const options = async (country: string) =>
    (await contributions.options(actor, name.slice(0, 10), country)).retailers;
  expect(await options("CA")).toEqual([]);
  await accept(ca.id);
  expect((await options("CA")).map((r) => (r as { id: string }).id)).toEqual([
    us.id,
  ]);
  expect(await contributionRepository.retailerHasMarket(us.id, "CA")).toBe(
    true,
  );
  // Now it is chosen, not proposed again, in either country.
  await expect(
    contributions.proposeRetailer(
      actor,
      id(),
      retailerInput.parse({
        name,
        websiteUrl: "https://example.com",
        country: "CA",
        note: "Proposing the Canadian stores a second time.",
      }),
    ),
  ).rejects.toMatchObject({ code: "RETAILER_EXISTS" });
  await expect(
    contributions.proposeRetailer(
      actor,
      id(),
      retailerInput.parse({
        name: `Elsewhere ${id().slice(0, 6)}`,
        websiteUrl: "https://example.com",
        country: "ZZ",
        note: "A retailer in a country that is not active.",
      }),
    ),
  ).rejects.toMatchObject({ code: "INVALID_COUNTRY" });
  // The inbox labels each item with its country.
  const pending = await contributions.proposeRetailer(
    actor,
    id(),
    retailerInput.parse({
      name: `Prairie Market ${id().slice(0, 6)}`,
      websiteUrl: "https://example.com",
      country: "CA",
      note: "A Canadian retailer with a public store directory.",
    }),
  );
  let item;
  for (
    let page = await moderation.inbox(admin, null);
    !item;
    page = await moderation.inbox(admin, page.nextCursor)
  ) {
    item = page.items.find((entry) => entry.id === pending.id);
    if (!page.nextCursor) break;
  }
  expect(item).toMatchObject({ kind: "proposal", country: "CA" });
});
