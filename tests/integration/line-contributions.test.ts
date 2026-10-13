import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture, lineOf } from "./fixtures";
import { communityServices } from "../../server/community/infrastructure/composition";
import { ratingsService } from "../../server/ratings/infrastructure/composition";
import {
  changeInput,
  reportInput,
  submissionIdentity,
  submissionInput,
  type SubmissionInput,
} from "../../server/community/domain/contracts";

const id = () => crypto.randomUUID();
const tag = () => crypto.randomUUID().slice(0, 8);
const photo = () =>
  Uint8Array.from(atob(env.TEST_IMAGES.jpeg), (c) => c.charCodeAt(0));
const evidence = {
  urls: ["https://example.com/package"],
  imageIds: [],
  note: "The package shows the flavor and that it's sold for the holidays.",
};

// One brand adding products to one food; the second food is elsewhere.
async function world() {
  const f = await catalogFixture(env.DB, 3);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const services = communityServices(env, id);
  const contributor = { ...f.users[0]!, administrator: false },
    operator = { ...f.users[1]!, administrator: true };
  const brand = `Orchard ${tag()}`,
    food = f.categories[0]!;
  const parse = (fields: Partial<SubmissionInput>) =>
    submissionInput.parse({
      brand,
      country: "US",
      categoryIds: [food],
      imageSlots: ["front"],
      ...fields,
    });
  // Checks, uploads the front photo and finalizes, as Add a product does.
  const submit = async (fields: Partial<SubmissionInput>) => {
    const input = parse(fields);
    const checked = await services.submissions.preflight(
      contributor,
      id(),
      input,
    );
    if (!checked.receiptId) return checked;
    await services.media.upload(contributor, {
      receiptId: checked.receiptId,
      slot: "front",
      idempotencyKey: id(),
      bytes: photo(),
    });
    return services.submissions.finalize(contributor, checked.receiptId, input);
  };
  const publish = async (fields: Partial<SubmissionInput>) => {
    const result = await submit(fields);
    expect(result).toMatchObject({ decision: "READY" });
    return result as { productId: string; slug: string };
  };
  const product = async (productId: string) =>
    (await env.DB.prepare(
      `SELECT p.product_family_id AS lineId,p.flavor,p.seasonal,f.canonical_name AS lineName
      FROM products p JOIN product_families f ON f.id=p.product_family_id WHERE p.id=?`,
    )
      .bind(productId)
      .first<{
        lineId: string;
        flavor: string | null;
        seasonal: number;
        lineName: string;
      }>())!;
  const revision = async (productId: string) =>
    (await services.repository.snapshot(productId)).revision;
  return {
    f,
    services,
    contributor,
    operator,
    brand,
    food,
    parse,
    submit,
    publish,
    product,
    revision,
  };
}

it("adds a new flavor to its line without a hold and names a flavored product's own line", async () => {
  const w = await world();
  const original = await w.publish({ name: "Orchard Patties" });
  const line = await w.product(original.productId);
  expect(line).toMatchObject({
    flavor: null,
    seasonal: 0,
    lineName: "Orchard Patties",
  });
  // Outside its line, a flavor reads as a near-duplicate and waits.
  expect(
    (
      await w.services.submissions.preflight(
        w.contributor,
        id(),
        w.parse({ name: "Orchard Patties Smoky", flavor: "Smoky" }),
      )
    ).decision,
  ).toBe("NEEDS_REVIEW");
  // In it, the line's flavors are siblings and it publishes right away.
  const smoky = await w.publish({
    name: "Orchard Patties, Smoky",
    flavor: "Smoky",
    lineId: line.lineId,
  });
  expect(await w.product(smoky.productId)).toMatchObject({
    lineId: line.lineId,
    flavor: "Smoky",
  });
  // An exact duplicate is still refused.
  expect(
    await w.submit({
      name: "Orchard Patties, Smoky",
      flavor: "Smoky",
      lineId: line.lineId,
    }),
  ).toMatchObject({ decision: "NEEDS_CHANGES" });
  // A flavored new product starts its own line, named without the flavor.
  const spicy = await w.publish({
    name: "Orchard Bites Spicy",
    flavor: "Spicy",
    lineName: "Orchard Bites",
  });
  const bites = await w.product(spicy.productId);
  expect(bites).toMatchObject({ lineName: "Orchard Bites", flavor: "Spicy" });
  expect(bites.lineId).not.toBe(line.lineId);
  // Only the brand's own lines can be joined, and only one way at a time.
  await expect(
    w.services.submissions.preflight(
      w.contributor,
      id(),
      w.parse({
        name: "Other Patties",
        brand: `Other ${tag()}`,
        lineId: line.lineId,
      }),
    ),
  ).rejects.toMatchObject({ code: "INVALID_LINE" });
  expect(
    submissionInput.safeParse({
      ...w.parse({ name: "Both" }),
      lineId: line.lineId,
      lineName: "Both",
    }).success,
  ).toBe(false);
});

it("follows the food's season unless told and saves a Tastiest answer with the rating", async () => {
  const w = await world();
  await env.DB.prepare(
    "UPDATE categories SET season_start=11,season_end=1 WHERE id=?",
  )
    .bind(w.food)
    .run();
  const nog = await w.publish({
    name: "Orchard Eggnog",
    rating: 4,
    enjoyment: 5,
  });
  expect((await w.product(nog.productId)).seasonal).toBe(1);
  const allYear = await w.publish({
    name: "Orchard Cider Punch",
    seasonal: false,
  });
  expect((await w.product(allYear.productId)).seasonal).toBe(0);
  expect(
    await env.DB.prepare(
      "SELECT r.overall_similarity AS closest,r.enjoyment AS tastiest FROM ratings r JOIN product_versions v ON v.id=r.product_version_id WHERE v.product_id=? AND r.user_id=?",
    )
      .bind(nog.productId, w.contributor.id)
      .first(),
  ).toEqual({ closest: 4, tastiest: 5 });
  // A Tastiest answer needs a rating to ride with.
  expect(
    submissionInput.safeParse({ ...w.parse({ name: "Nog" }), enjoyment: 4 })
      .success,
  ).toBe(false);
});

it("suggests brands loosely, lists a brand's lines with the food's first and matches names loosely", async () => {
  const w = await world();
  const patties = await w.publish({ name: "Orchard Patties" });
  const line = (await w.product(patties.productId)).lineId;
  const smoky = await w.publish({
    name: "Orchard Patties, Smoky",
    flavor: "Smoky",
    lineId: line,
  });
  await w.publish({ name: "Orchard Mince", categoryIds: [w.f.categories[1]!] });
  const brandId = (await env.DB.prepare("SELECT id FROM brands WHERE name=?")
    .bind(w.brand)
    .first<string>("id"))!;
  // A typo still finds it, with its products here.
  const found = await w.services.submissions.brandSuggestions(
    w.contributor,
    "US",
    w.brand.replace("Orchard", "Orchrd"),
  );
  expect(found.find((b) => b.id === brandId)).toMatchObject({
    name: w.brand,
    productCount: 3,
  });
  const lines = await w.services.submissions.brandLines(
    w.contributor,
    brandId,
    "US",
    w.f.categories[1]!,
  );
  expect(lines.map((l) => [l.name, l.flavors.map((f) => f.flavor)])).toEqual([
    ["Orchard Mince", [null]],
    ["Orchard Patties", [null, "Smoky"]],
  ]);
  // A discontinued flavor isn't offered.
  await env.DB.prepare(
    "UPDATE products SET lifecycle_status='discontinued' WHERE id=?",
  )
    .bind(smoky.productId)
    .run();
  expect(
    (
      await w.services.submissions.brandLines(
        w.contributor,
        brandId,
        "US",
        w.food,
      )
    )[0]!.flavors.map((f) => f.flavor),
  ).toEqual([null]);
  // One shared word is enough while typing, from a loosely typed brand...
  const matches = (fields: Record<string, unknown>) =>
    w.services.submissions.identityMatches(
      w.contributor,
      submissionIdentity.parse({ country: "US", ...fields }),
    );
  expect(
    (await matches({ name: "Orchard Meat", brand: "Orchrd" })).map(
      (c) => c.name,
    ),
  ).toEqual(expect.arrayContaining(["Orchard Patties", "Orchard Mince"]));
  // ...but never holds a submission on its own.
  expect(
    (
      await w.services.submissions.preflight(
        w.contributor,
        id(),
        w.parse({ name: "Orchard Meat" }),
      )
    ).decision,
  ).toBe("READY");
  // A new flavor's own line is left out.
  expect(
    (
      await matches({
        name: "Orchard Patties, Herb",
        brand: w.brand,
        lineId: line,
      })
    ).map((c) => c.name),
  ).not.toContain("Orchard Patties");
});

it("moves a flavor to a new line, renames a line and reverses both, rescoring each line", async () => {
  const w = await world();
  const original = await w.publish({ name: "Orchard Patties" });
  const lineA = (await w.product(original.productId)).lineId;
  const smoky = await w.publish({
    name: "Orchard Patties, Smoky",
    flavor: "Smoky",
    lineId: lineA,
  });
  const version = (await env.DB.prepare(
    "SELECT id FROM product_versions WHERE product_id=? AND is_current=1",
  )
    .bind(smoky.productId)
    .first<string>("id"))!;
  await ratingsService(env).rate(
    { id: w.f.users[2]!.id, accountState: "active" },
    version,
    w.food,
    5,
  );
  const people = async (line: string) =>
    (await env.DB.prepare(
      "SELECT people_count FROM family_category_stats WHERE product_family_id=? AND category_id=?",
    )
      .bind(line, w.food)
      .first<number>("people_count")) ?? 0;
  expect(await people(lineA)).toBe(1);

  const moved = await w.services.moderation.moveLine(
    w.operator,
    id(),
    smoky.productId,
    {
      expectedRevision: await w.revision(smoky.productId),
      newLineName: "Orchard Smoky Patties",
      note: "Smoky has its own base recipe.",
    },
  );
  const lineB = await w.product(smoky.productId);
  expect(lineB.lineName).toBe("Orchard Smoky Patties");
  expect(lineB.lineId).not.toBe(lineA);
  // Both lines are rescored with the move.
  expect(await people(lineA)).toBe(0);
  expect(await people(lineB.lineId)).toBe(1);
  // The moderation view offers the brand's lines for the next move.
  expect(
    (await w.services.moderation.product(w.operator, smoky.productId)).lines
      .map((l) => l.name)
      .sort(),
  ).toEqual(["Orchard Patties", "Orchard Smoky Patties"]);
  await w.services.moderation.reverse(w.operator, id(), moved.actionId, {
    expectedRevision: await w.revision(smoky.productId),
    note: "Moved by mistake; it's the same recipe.",
  });
  expect((await w.product(smoky.productId)).lineId).toBe(lineA);
  expect(await people(lineA)).toBe(1);

  const renamed = await w.services.moderation.renameLine(
    w.operator,
    id(),
    original.productId,
    {
      expectedRevision: await w.revision(original.productId),
      name: "Orchard Garden Patties",
      note: "The package now says Garden Patties.",
    },
  );
  // Every flavor of the line takes the name.
  expect((await w.product(smoky.productId)).lineName).toBe(
    "Orchard Garden Patties",
  );
  await w.services.moderation.reverse(w.operator, id(), renamed.actionId, {
    expectedRevision: await w.revision(original.productId),
    note: "The earlier name was right after all.",
  });
  expect((await w.product(original.productId)).lineName).toBe(
    "Orchard Patties",
  );
  // Another brand's line can't take it.
  await expect(
    w.services.moderation.moveLine(w.operator, id(), smoky.productId, {
      expectedRevision: await w.revision(smoky.productId),
      lineId: lineOf(w.f.productId),
      note: "Trying another brand's line.",
    }),
  ).rejects.toMatchObject({ code: "INVALID_FAMILY" });
});

it("accepts a flavor rename and a seasonal mark as proposals and takes the new report reasons", async () => {
  const w = await world();
  const product = await w.publish({ name: "Orchard Nuggets" });
  const propose = async (fields: Record<string, unknown>) =>
    w.services.contributions.propose(
      w.contributor,
      id(),
      changeInput.parse({
        productId: product.productId,
        expectedRevision: await w.revision(product.productId),
        evidence,
        ...fields,
      }),
    );
  const accept = async (proposalId: string) =>
    w.services.moderation.decide(w.operator, id(), "proposal", proposalId, {
      decision: "accept",
      expectedRevision: (await w.services.repository.proposal(proposalId))!
        .updated_at,
      note: "The package photo supports this change.",
      effect: "none",
    });
  await accept(
    (
      await propose({
        kind: "rename",
        name: "Orchard Nuggets",
        flavor: "Spicy",
      })
    ).id,
  );
  await accept((await propose({ kind: "seasonal", seasonal: true })).id);
  expect(await w.product(product.productId)).toMatchObject({
    flavor: "Spicy",
    seasonal: 1,
  });
  // Variant and specialty-flavor links are gone with lines.
  expect(
    changeInput.safeParse({
      kind: "relationships",
      productId: product.productId,
      expectedRevision: 1,
      evidence,
      productFamilyId: null,
      relatedProductId: product.productId,
      relationship: "variant",
      categoryEligibility: [],
    }).success,
  ).toBe(false);
  for (const reason of ["flavor_not_real", "wrong_line"])
    expect(
      reportInput.safeParse({
        targetType: "product",
        targetId: product.productId,
        reason,
      }).success,
    ).toBe(true);
});
