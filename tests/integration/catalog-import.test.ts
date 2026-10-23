import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { IMPORT_STORES } from "../../scripts/catalog-import/retailers";
import { verifyImport } from "../../scripts/catalog-import/verify";
import { catalogFixture, testMarket } from "./fixtures";
import { catalogService } from "../../server/catalog/infrastructure/composition";
import {
  CatalogImportService,
  type ImportStore,
  type ImportTarget,
} from "../../server/community/application/catalog-import-service";
import {
  importIds,
  importImageId,
  importLineId,
  type ImportFacts,
  type ImportManifest,
  type ImportPhoto,
} from "../../server/community/domain/catalog-import";
import { submissionInput } from "../../server/community/domain/contracts";
import { fingerprint } from "../../server/community/domain/policy";
import { CatalogDecisionRepository } from "../../server/community/infrastructure/catalog-decision-repository";
import { communityServices } from "../../server/community/infrastructure/composition";
import { CommunityLookupRepository } from "../../server/community/infrastructure/lookup-repository";
import { ModerationRepository } from "../../server/community/infrastructure/moderation-repository";
import { readMedia } from "../../server/media/infrastructure/media-reader";
import { R2MediaStorage } from "../../server/media/infrastructure/r2-storage";
import { lineRefresh } from "../../server/ranking/infrastructure/line-refresh";
import { INITIAL_RANKING_PARAMETERS } from "../../server/ranking/domain/policy";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";

// The store-photo import (docs/IMPORTER_PLAN.md): one product, one
// transaction with the rows a published submission has, audited as a
// reversible `product_import` action, and reruns that write nothing.

const id = () => crypto.randomUUID();
const bytes = () =>
  Uint8Array.from(atob(env.TEST_IMAGES.webp), (c) => c.charCodeAt(0));

async function setup() {
  const f = await catalogFixture(env.DB, 2);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const community = communityServices(env, id);
  const moderation = new ModerationRepository(env.DB);
  const lines = lineRefresh(env);
  const service = new CatalogImportService(
    env.DB,
    new R2MediaStorage(env.MEDIA_BUCKET),
    new CommunityLookupRepository(env.DB),
    moderation,
    new CatalogDecisionRepository(moderation, lines),
    lines,
    (actor, key, input) =>
      community.contributions.proposeRetailer(actor, key, input),
    id,
  );
  const admin = { ...f.users[0]!, administrator: true };
  const tag = id().slice(0, 8);
  const store: ImportStore = {
    name: `Corner Market ${tag}`,
    aliases: [`Corner Market Stores ${tag}`],
    websiteUrl: "https://example.com/store",
  };
  const { ids: stores } = await service.ensureStores(admin, [store], "US");
  const target: ImportTarget = {
    foods: new Map([["milk", f.categories[0]!]]),
    stores,
  };
  const photo = bytes();
  const info = await env.IMAGES.info(new Blob([photo]).stream());
  if (!("width" in info)) throw new Error("The sample photo is not raster.");
  const copy = {
    sha256: await fingerprint(photo),
    bytes: photo.length,
    width: info.width,
    height: info.height,
  };
  const photoOf = (slot: ImportPhoto["slot"]): ImportPhoto => ({
    slot,
    name: `${slot}.webp`,
    full: copy,
    thumbnail: copy,
  });
  const lineKey = `oatside${tag}|oatmilk|milk`;
  const facts = (
    source: string,
    overrides: Partial<ImportFacts> = {},
  ): ImportFacts => ({
    sourceKey: `Photos ${tag} - Web/${source}`,
    country: "US",
    brand: `Oatside ${tag}`,
    line: {
      key: lineKey,
      name: "Oat Milk",
      first: `Photos ${tag} - Web/A1`,
    },
    name: `Oat Milk ${source}`,
    food: "milk",
    packageLabel: "vegan",
    labelEvidence: "VEGAN on the front",
    stores: [store.name],
    photos: [photoOf("front"), photoOf("ingredients")],
    ...overrides,
  });
  const read = async () => bytes();
  const run = { id: id(), manifestHash: "c".repeat(64) };
  return {
    f,
    community,
    service,
    admin,
    tag,
    store,
    stores,
    target,
    photoOf,
    facts,
    read,
    run,
  };
}

const count = (sql: string, ...values: unknown[]) =>
  env.DB.prepare(sql)
    .bind(...values)
    .first<number>("n");

// What a product is in the catalog, apart from its ids, name and author.
async function shape(productId: string) {
  const one = (sql: string) => env.DB.prepare(sql).bind(productId).first();
  const all = async (sql: string) =>
    (await env.DB.prepare(sql).bind(productId).all()).results;
  return {
    product: await one(
      "SELECT product_type,lifecycle_status,vegan_status,manufacturer_label,manufacturer_url,seasonal,flavor,development_only,published_at IS NOT NULL AS published,created_by IS NOT NULL AS authored FROM products WHERE id=?",
    ),
    line: await one(
      "SELECT f.country_id=p.country_id AS sameCountry,f.brand_id=p.brand_id AS sameBrand,f.slug LIKE 'us-%' AS slugged FROM products p JOIN product_families f ON f.id=p.product_family_id WHERE p.id=?",
    ),
    identity: await one(
      "SELECT COUNT(*) AS n FROM product_identity_keys WHERE product_id=?",
    ),
    formulas: await all(
      "SELECT version_label,is_current,created_by IS NOT NULL AS authored FROM product_versions WHERE product_id=?",
    ),
    foods: await all(
      "SELECT ranking_eligible,created_by IS NOT NULL AS authored FROM product_categories WHERE product_id=?",
    ),
    classification: await one(
      "SELECT f.vegan_status,f.manufacturer_label,f.ingredients_checked,f.reviewed_by,json_array_length(f.evidence_data,'$.urls') AS urls FROM formula_classifications f JOIN product_versions v ON v.id=f.product_version_id WHERE v.product_id=?",
    ),
    photos: await all(
      "SELECT i.slot,i.state,i.mime_type,i.submitted_by IS NOT NULL AS authored FROM product_images i JOIN product_versions v ON v.id=i.product_version_id WHERE v.product_id=? ORDER BY i.slot",
    ),
    stores: await all(
      "SELECT status,confirmation_count,disagreement_count FROM product_retailers WHERE product_id=?",
    ),
    confirmations: await all(
      "SELECT stance FROM retailer_confirmations WHERE product_id=?",
    ),
    search: await one(
      "SELECT COUNT(*) AS n FROM search_index WHERE entity_type='product' AND entity_id=?",
    ),
    firstPublished: await one(
      "SELECT COUNT(*) AS n FROM family_category_first_published WHERE product_family_id=(SELECT product_family_id FROM products WHERE id=?)",
    ),
    published: await one(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action='product_published' AND entity_id=?",
    ),
  };
}

it("keeps the verification digest stable when detail ratings are rebuilt at a later clock", async () => {
  const s = await setup();
  await s.service.ensureStores(s.admin, IMPORT_STORES, "US");
  const facts = s.facts("A1");
  expect(
    await s.service.importProduct(s.admin, s.run, facts, s.target, s.read),
  ).toMatchObject({ status: "written" });
  const { version } = importIds(facts.sourceKey);
  const category = s.f.categories[0]!;
  const dimension = id();
  await env.DB.prepare(
    "INSERT INTO category_rating_dimensions(id,category_id,key,label,sort_order,is_active,created_at,updated_at) VALUES(?,?,'taste','Taste',0,1,1,1)",
  )
    .bind(dimension, category)
    .run();
  const now = Date.now();
  const ratings = new RatingsService(
    new D1RatingsRepository(env.DB),
    INITIAL_RANKING_PARAMETERS,
    id,
    () => now,
  );
  await ratings.rate(s.admin, version, category, 4, {
    dimensions: { taste: 5 },
  });
  const manifest: ImportManifest = {
    version: 1,
    hash: s.run.manifestHash,
    batches: [{ folder: `Photos ${s.tag} - Web`, products: 1 }],
    products: [
      { facts, internal: { sizes: [], confidence: "high", notes: [] } },
    ],
  };
  const before = await verifyImport(env, manifest, { sample: 1 });
  expect(before.problems).toEqual([]);
  const detail = () =>
    env.DB.prepare(
      "SELECT people_count,mean_sum,recomputed_at FROM family_category_dimension_stats WHERE product_family_id=? AND category_id=? AND dimension_id=?",
    )
      .bind(importLineId(facts.sourceKey), category, dimension)
      .first();
  expect(await detail()).toEqual({
    people_count: 1,
    mean_sum: 5,
    recomputed_at: now,
  });

  await lineRefresh(env).refreshAll(now + 1000);
  expect(await detail()).toEqual({
    people_count: 1,
    mean_sum: 5,
    recomputed_at: now + 1000,
  });
  const rebuilt = await verifyImport(env, manifest, { sample: 1 });
  expect(rebuilt.problems).toEqual([]);
  expect(rebuilt.digest).toBe(before.digest);

  // A real change to a detail answer must still change the digest.
  await ratings.rate(s.admin, version, category, 4, {
    dimensions: { taste: 3 },
  });
  expect((await verifyImport(env, manifest, { sample: 0 })).digest).not.toBe(
    before.digest,
  );
});

it("imports a recipe line and a lone product with the rows a published submission writes", async () => {
  const s = await setup();
  const line = [
    s.facts("A1"),
    s.facts("A2", { flavor: "Vanilla", name: "Oat Milk Vanilla" }),
    s.facts("A3", { flavor: "Strawberry", name: "Oat Milk Strawberry" }),
  ];
  const lone = s.facts("B1", {
    brand: `Dairyless ${s.tag}`,
    line: {
      key: `dairyless${s.tag}|cream|milk`,
      name: "Cream",
      first: `Photos ${s.tag} - Web/B1`,
    },
    name: "Pouring Cream",
    photos: [s.photoOf("front")],
  });
  for (const facts of [...line, lone])
    expect(
      await s.service.importProduct(s.admin, s.run, facts, s.target, s.read),
    ).toMatchObject({ status: "written" });
  const [first, ...flavors] = line.map((facts) => importIds(facts.sourceKey));
  // One line of three flavors, started by its original and named for it.
  expect(
    (
      await env.DB.prepare(
        "SELECT p.flavor,f.id AS line,f.canonical_name AS name FROM products p JOIN product_families f ON f.id=p.product_family_id WHERE p.id IN (?,?,?) ORDER BY p.flavor",
      )
        .bind(first!.product, flavors[0]!.product, flavors[1]!.product)
        .all()
    ).results,
  ).toEqual(
    [null, "Strawberry", "Vanilla"].map((flavor) => ({
      flavor,
      line: importLineId(line[0]!.sourceKey),
      name: "Oat Milk",
    })),
  );
  // Vegan on the package with an ingredients photo nobody read: not checked.
  expect(await shape(first!.product)).toMatchObject({
    product: { vegan_status: "appears_vegan", manufacturer_label: "vegan" },
    classification: { ingredients_checked: 0, reviewed_by: null },
    photos: [
      { slot: "front", state: "accepted" },
      { slot: "ingredients", state: "accepted" },
    ],
  });
  expect(
    await count(
      "SELECT COUNT(*) AS n FROM moderation_actions WHERE kind='product_import' AND product_id=? AND actor_id=?",
      first!.product,
      s.admin.id,
    ),
  ).toBe(1);

  // A twin published through Add a product has the same catalog rows.
  const input = submissionInput.parse({
    name: `Pouring Cream Twin ${s.tag}`,
    brand: `Dairyless Twin ${s.tag}`,
    country: "US",
    categoryIds: [s.f.categories[0]],
    imageSlots: ["front"],
    manufacturerLabel: "vegan",
    retailerIds: [s.stores.values().next().value],
    statusBasis: "Added with a front photo for the comparison.",
  });
  const actor = { ...s.f.users[1]!, administrator: false };
  const checked = await s.community.submissions.preflight(actor, id(), input);
  expect(checked.decision).toBe("READY");
  await s.community.media.upload(actor, {
    receiptId: checked.receiptId!,
    slot: "front",
    idempotencyKey: id(),
    bytes: bytes(),
  });
  const published = await s.community.submissions.finalize(
    actor,
    checked.receiptId!,
    input,
  );
  expect(published).toMatchObject({ decision: "READY" });
  const imported = await shape(importIds(lone.sourceKey).product);
  expect(imported).toMatchObject({
    product: { lifecycle_status: "active", development_only: 0 },
    stores: [{ status: "active", confirmation_count: 1 }],
    confirmations: [{ stance: "confirm" }],
    search: { n: 1 },
    firstPublished: { n: 1 },
  });
  expect(imported).toEqual(
    await shape((published as { productId: string }).productId),
  );
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});

it("writes nothing on a rerun, skips changed facts and refuses changed photos", async () => {
  const s = await setup();
  const facts = s.facts("A1");
  await s.service.importProduct(s.admin, s.run, facts, s.target, s.read);
  const totals = () =>
    env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM products) AS products,(SELECT COUNT(*) FROM audit_log) AS audit,(SELECT COUNT(*) FROM moderation_actions) AS actions,(SELECT COUNT(*) FROM contribution_receipts) AS receipts,(SELECT COUNT(*) FROM product_images) AS photos",
    ).first();
  const before = await totals();
  const productId = importIds(facts.sourceKey).product;
  expect(
    await s.service.importProduct(s.admin, s.run, facts, s.target, s.read),
  ).toEqual({ status: "replayed", productId });
  expect(
    await s.service.importProduct(
      s.admin,
      { ...s.run, id: id() },
      { ...facts, name: "Oat Milk Classic" },
      s.target,
      s.read,
    ),
  ).toEqual({ status: "changed", productId });
  expect(await totals()).toEqual(before);
  expect(
    await count(
      "SELECT COUNT(*) AS n FROM products WHERE name='Oat Milk A1' AND id=?",
      productId,
    ),
  ).toBe(1);
  // Bytes that differ from the manifest's are never uploaded.
  const other = s.facts("A9", { flavor: "Mocha", name: "Oat Milk Mocha" });
  expect(
    await s.service.importProduct(
      s.admin,
      s.run,
      other,
      s.target,
      async () => new Uint8Array([1, 2, 3]),
    ),
  ).toMatchObject({
    status: "blocked",
    reason: expect.stringContaining("changed since the manifest was built"),
  });
});

it("plans without writing, and waits for a line's first product", async () => {
  const s = await setup();
  const first = s.facts("A1");
  const later = s.facts("A2", { flavor: "Vanilla", name: "Oat Milk Vanilla" });
  const pending = { lines: new Set<string>(), stores: new Set<string>() };
  expect(await s.service.plan(s.admin, first, s.target, pending)).toMatchObject(
    {
      status: "ready",
      waitsForLine: false,
    },
  );
  pending.lines.add(importLineId(first.sourceKey));
  expect(await s.service.plan(s.admin, later, s.target, pending)).toMatchObject(
    {
      status: "ready",
      waitsForLine: true,
    },
  );
  expect(
    await count(
      "SELECT COUNT(*) AS n FROM products WHERE id=?",
      importIds(first.sourceKey).product,
    ),
  ).toBe(0);
  // A store the run adds first stands in during the dry run.
  expect(
    await s.service.plan(
      s.admin,
      s.facts("D1", {
        stores: ["Brand New Grocer"],
        line: {
          ...first.line,
          key: "new-store",
          first: `Photos ${s.tag} - Web/D1`,
        },
        name: "Oat Milk Barista",
      }),
      s.target,
      { ...pending, stores: new Set(["brandnewgrocer"]) },
    ),
  ).toMatchObject({ status: "ready" });
  // Written before its line exists, a later product waits for it.
  expect(
    await s.service.importProduct(s.admin, s.run, later, s.target, s.read),
  ).toMatchObject({
    status: "blocked",
    reason: "Its line's first product isn't imported yet.",
  });
  expect(
    await s.service.importProduct(s.admin, s.run, first, s.target, s.read),
  ).toMatchObject({ status: "written" });
  expect(
    await s.service.importProduct(s.admin, s.run, later, s.target, s.read),
  ).toMatchObject({ status: "written" });
  expect(await s.service.plan(s.admin, first, s.target, pending)).toMatchObject(
    {
      status: "replayed",
    },
  );
  // An exact duplicate by another source is refused before writing.
  expect(
    await s.service.plan(
      s.admin,
      s.facts("C1", {
        name: "Oat Milk A1 12 oz",
        line: {
          ...first.line,
          key: "other",
          first: `Photos ${s.tag} - Web/C1`,
        },
      }),
      s.target,
      pending,
    ),
  ).toMatchObject({
    status: "blocked",
    reason: expect.stringContaining("An exact duplicate is already listed"),
  });
});

it("adds each store once through an accepted retailer proposal", async () => {
  const s = await setup();
  const retailerId = s.stores.values().next().value!;
  expect(await s.service.ensureStores(s.admin, [s.store], "US")).toMatchObject({
    created: [],
  });
  expect(
    await env.DB.prepare(
      "SELECT p.status,p.change_type,(SELECT COUNT(*) FROM moderation_actions a WHERE a.target_id=p.id AND a.kind='proposal_accept') AS accepted,(SELECT COUNT(*) FROM retailer_markets m JOIN countries c ON c.id=m.country_id AND c.iso2='US' WHERE m.retailer_id=p.target_id) AS markets,(SELECT COUNT(*) FROM retailer_aliases WHERE retailer_id=p.target_id) AS names FROM edit_proposals p WHERE p.target_id=?",
    )
      .bind(retailerId)
      .all(),
  ).toMatchObject({
    results: [
      {
        status: "accepted",
        change_type: "retailer",
        accepted: 1,
        markets: 1,
        names: 2,
      },
    ],
  });
});

it("serves imported label photos without an evidence copy, and a reversed import hides the product", async () => {
  const s = await setup();
  const facts = s.facts("A1");
  const ids = importIds(facts.sourceKey);
  const written = await s.service.importProduct(
    s.admin,
    s.run,
    facts,
    s.target,
    s.read,
  );
  if (written.status !== "written") throw new Error(written.status);
  const product = await catalogService(env).product(
    testMarket(s.f.countryId),
    written.slug,
    null,
  );
  expect(
    product.images.map(({ slot, hasEvidence }) => ({ slot, hasEvidence })),
  ).toEqual([
    { slot: "front", hasEvidence: 0 },
    { slot: "ingredients", hasEvidence: 0 },
  ]);
  const front = importImageId(
    facts.sourceKey,
    "front",
    facts.photos[0]!.full.sha256,
  );
  const media = () =>
    readMedia(
      env.DB,
      env.MEDIA_BUCKET,
      front,
      "full",
      new Request("https://example.invalid/media"),
    );
  expect((await media()).status).toBe(200);
  const lineStats = () =>
    count(
      "SELECT COUNT(*) AS n FROM family_category_stats WHERE product_family_id=? AND lead_product_id IS NOT NULL",
      importLineId(facts.sourceKey),
    );
  const ledBefore = await lineStats();

  const { revision } = await s.community.repository.snapshot(ids.product);
  await s.community.moderation.reverse(s.admin, id(), ids.action, {
    expectedRevision: revision,
    note: "Reversing the import for the test.",
  });
  expect(
    await env.DB.prepare("SELECT lifecycle_status FROM products WHERE id=?")
      .bind(ids.product)
      .first("lifecycle_status"),
  ).toBe("hidden");
  expect(
    await count(
      "SELECT COUNT(*) AS n FROM search_index WHERE entity_id=?",
      ids.product,
    ),
  ).toBe(0);
  expect(await lineStats()).toBe(0);
  expect(ledBefore).toBeGreaterThanOrEqual(0);
  expect((await media()).status).toBe(404);
  expect(
    await env.DB.prepare(
      "SELECT reversed_by IS NOT NULL AS reversed FROM moderation_actions WHERE id=?",
    )
      .bind(ids.action)
      .first("reversed"),
  ).toBe(1);
});
