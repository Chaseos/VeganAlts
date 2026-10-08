import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { prepareLegacyReports } from "../../db/upgrades/legacy-reports";
import { normalizeCatalogIdentity } from "../../db/upgrades/catalog-identity";
import {
  identityKey,
  normalizeName,
} from "../../server/community/domain/policy";
import { CommunityLookupRepository } from "../../server/community/infrastructure/lookup-repository";

it("upgrades milestone 2 with durable history and backfills only current formula classifications", async () => {
  const old = env.TEST_MIGRATIONS.filter((m) => Number(m.name.slice(0, 4)) < 6),
    db = env.DB_UPGRADE;
  expect(await prepareLegacyReports(db)).toEqual({ groups: 0, archived: 0 });
  await applyD1Migrations(db, old);
  const f = await catalogFixture(db, 2),
    historical = crypto.randomUUID(),
    rating = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        "INSERT INTO product_versions(id,product_id,is_current,created_at,updated_at) VALUES(?,?,0,1,1)",
      )
      .bind(historical, f.productId),
    db
      .prepare(
        "INSERT INTO ratings(id,user_id,product_version_id,category_id,overall_similarity,created_at,updated_at) VALUES(?,?,?,?,5,1,1)",
      )
      .bind(rating, f.users[0]!.id, historical, f.categories[0]),
    db
      .prepare("UPDATE products SET vegan_status='under_review' WHERE id=?")
      .bind(f.productId),
  ]);
  const before = await db
    .prepare("SELECT * FROM ratings WHERE id=?")
    .bind(rating)
    .first();
  // Earlier releases allowed the same reporter/reason more than once.
  const reports = [
    {
      id: "legacy-a",
      status: "open",
      note: "First ingredient concern.",
      reason: "ingredient_concern",
      user: f.users[0]!.id,
    },
    {
      id: "legacy-b",
      status: "reviewing",
      note: "Additional label evidence.",
      reason: "ingredient_concern",
      user: f.users[0]!.id,
    },
    {
      id: "legacy-c",
      status: "open",
      note: "Third source.",
      reason: "ingredient_concern",
      user: f.users[0]!.id,
    },
    {
      id: "legacy-resolved",
      status: "resolved",
      note: "Previously resolved.",
      reason: "ingredient_concern",
      user: f.users[0]!.id,
    },
    {
      id: "legacy-other-reason",
      status: "open",
      note: null,
      reason: "other",
      user: f.users[0]!.id,
    },
    {
      id: "legacy-other-user",
      status: "open",
      note: "Independent contributor.",
      reason: "ingredient_concern",
      user: f.users[1]!.id,
    },
  ];
  await db.batch(
    reports.map((report) =>
      db
        .prepare(
          "INSERT INTO reports(id,reporter_user_id,target_type,target_id,reason_code,note,status,created_at,updated_at) VALUES(?,?,'product',?,?,?,?,1,1)",
        )
        .bind(
          report.id,
          report.user,
          f.productId,
          report.reason,
          report.note,
          report.status,
        ),
    ),
  );
  const originalReports = (
    await db.prepare("SELECT * FROM reports ORDER BY id").all()
  ).results;
  expect(await prepareLegacyReports(db, 123)).toEqual({
    groups: 1,
    archived: 2,
  });
  expect(await prepareLegacyReports(db, 124)).toEqual({
    groups: 0,
    archived: 0,
  });
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
  expect(await prepareLegacyReports(db, 125)).toEqual({
    groups: 0,
    archived: 0,
  });
  const winner = await db
    .prepare("SELECT * FROM reports WHERE id='legacy-a'")
    .first();
  expect(winner).toMatchObject({ status: "reviewing", resolved_at: null });
  for (const report of reports.slice(0, 3))
    expect(winner!.note).toContain(report.note);
  const audit = await db
    .prepare(
      "SELECT before_data FROM audit_log WHERE action='legacy_report_deduplication'",
    )
    .all<{ before_data: string }>();
  expect(audit.results).toHaveLength(1);
  expect(JSON.parse(audit.results[0]!.before_data)).toEqual(
    originalReports.filter((r) =>
      ["legacy-a", "legacy-b", "legacy-c"].includes(String(r.id)),
    ),
  );
  const updatedReports = (
    await db.prepare("SELECT * FROM reports ORDER BY id").all()
  ).results;
  expect(updatedReports).toHaveLength(originalReports.length);
  for (const original of originalReports) {
    const updated = updatedReports.find((r) => r.id === original.id);
    if (["legacy-b", "legacy-c"].includes(String(original.id))) {
      expect(updated).toMatchObject({
        status: "dismissed",
        note: original.note,
        resolved_at: 123,
      });
      expect(updated!.resolution_note).toContain("legacy-a");
    } else if (original.id !== "legacy-a") expect(updated).toEqual(original);
  }
  await expect(
    db
      .prepare(
        "INSERT INTO reports(id,reporter_user_id,target_type,target_id,reason_code,status,created_at,updated_at) VALUES('duplicate-after-upgrade',?,'product',?,'ingredient_concern','open',1,1)",
      )
      .bind(f.users[0]!.id, f.productId)
      .run(),
  ).rejects.toThrow(/UNIQUE/);
  expect(
    await db.prepare("SELECT * FROM ratings WHERE id=?").bind(rating).first(),
  ).toEqual(before);
  expect(
    await db
      .prepare(
        "SELECT vegan_status FROM formula_classifications WHERE product_version_id=?",
      )
      .bind(f.versionId)
      .first("vegan_status"),
  ).toBe("under_review");
  expect(
    await db
      .prepare(
        "SELECT * FROM formula_classifications WHERE product_version_id=?",
      )
      .bind(historical)
      .first(),
  ).toBeNull();
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
  expect(
    await db
      .prepare("SELECT COUNT(*) n FROM product_versions WHERE product_id=?")
      .bind(f.productId)
      .first("n"),
  ).toBe(2);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});

it("recomputes legacy names and identity keys with the application normalization", async () => {
  const db = env.DB,
    f = await catalogFixture(db, 1),
    t = crypto.randomUUID().slice(0, 8);
  const brand = `Élan ${t}`,
    product = `élan-${t}`,
    sqlLower = (value: string) =>
      value.replace(/[A-Z]/g, (c) => c.toLowerCase());
  // Values exactly as migration 0006's ASCII-only SQL backfill stored them.
  await db.batch([
    db
      .prepare(
        "INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      )
      .bind(
        `brand-${t}`,
        brand,
        sqlLower(brand).replaceAll(" ", ""),
        `brand-${t}`,
      ),
    db
      .prepare(
        "INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      )
      .bind(`brand-a-${t}`, `Ñu ${t}`, `Ñu${t}`, `brand-a-${t}`),
    db
      .prepare(
        "INSERT INTO brands(id,name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      )
      .bind(
        `brand-b-${t}`,
        `ñu ${t}`,
        normalizeName(`ñu ${t}`),
        `brand-b-${t}`,
      ),
    db
      .prepare(
        "INSERT INTO retailers(id,canonical_name,normalized_name,slug,created_at,updated_at) VALUES(?,?,?,?,1,1)",
      )
      .bind(`retailer-${t}`, `Ünion ${t}`, `Ünion${t}`, `retailer-${t}`),
    db
      .prepare(
        "INSERT INTO products(id,country_id,brand_id,name,slug,created_at,updated_at) VALUES(?,?,?,?,?,1,1)",
      )
      .bind(
        product,
        f.countryId,
        `brand-${t}`,
        "Original Oatmilk 64 fl oz",
        product,
      ),
    db
      .prepare(
        "INSERT INTO product_identity_keys(identity_key,product_id) VALUES(?,?)",
      )
      .bind(
        `${f.countryId}:${sqlLower(brand).replaceAll(" ", "")}:originaloatmilk64floz`,
        product,
      ),
  ]);
  const first = await normalizeCatalogIdentity(db);
  expect(first.conflicts).toBe(1);
  expect(
    await db
      .prepare("SELECT normalized_name FROM brands WHERE id=?")
      .bind(`brand-${t}`)
      .first("normalized_name"),
  ).toBe(normalizeName(brand));
  expect(
    await db
      .prepare("SELECT normalized_name FROM retailers WHERE id=?")
      .bind(`retailer-${t}`)
      .first("normalized_name"),
  ).toBe(normalizeName(`Ünion ${t}`));
  // The colliding legacy brand keeps its key for manual consolidation.
  expect(
    await db
      .prepare("SELECT normalized_name FROM brands WHERE id=?")
      .bind(`brand-a-${t}`)
      .first("normalized_name"),
  ).toBe(`Ñu${t}`);
  expect(
    (
      await db
        .prepare(
          "SELECT identity_key FROM product_identity_keys WHERE product_id=?",
        )
        .bind(product)
        .all()
    ).results,
  ).toEqual([
    { identity_key: identityKey(f.countryId, brand, "Original Oatmilk") },
  ]);
  expect(await normalizeCatalogIdentity(db)).toEqual({
    names: 0,
    keys: 0,
    conflicts: 1,
  });
  // A new submission now resolves the legacy brand and its exact product.
  await db.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await db
    .prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const lookup = new CommunityLookupRepository(db),
    identity = {
      name: "Original Oatmilk",
      brand: brand.toLowerCase(),
      country: "US" as const,
      categoryIds: [f.categories[0]!],
    };
  const context = await lookup.context(identity);
  expect(context.brandId).toBe(`brand-${t}`);
  expect((await lookup.candidates(identity, context))[0]).toMatchObject({
    id: product,
    exact: true,
  });
});
