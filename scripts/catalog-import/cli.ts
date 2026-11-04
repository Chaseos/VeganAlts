// The store-photo importer (docs/IMPORTER_PLAN.md): loads the owner's
// reviewed photo batches into the catalog. A dry run is the default; --apply
// writes, and needs the manifest hash the dry run printed. --verify checks an
// environment against the manifest without writing.
//
//   npm run catalog:import:local -- "<batch 1 web>" "<batch 2 web>" … --out "<folder>" --operator=<user id> [--apply --expect=<hash>] [--limit=<n>] [--only=<source key>] [--verify]
//   npm run catalog:import:staging -- (the same; the owner runs it)
//
// Batches go earliest first. The batch folders are only read; the manifest
// and reports go to --out, which must be outside the repository.
import { spawnSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "jsonc-parser";
import { v7 as uuid } from "uuid";
import { withCatalogPlatform } from "../catalog-platform";
import { buildManifest } from "./manifest";
import { IMPORT_STORES } from "./retailers";
import { adminIds, checkTarget } from "./target";
import { verifyImport } from "./verify";
import { applyReleaseReview } from "./release-review";
import { assertProductionApproval } from "./production-guard";
import {
  CatalogImportService,
  type ImportOutcome,
} from "../../server/community/application/catalog-import-service";
import { ContributionService } from "../../server/community/application/contribution-service";
import type { StagedMediaService } from "../../server/community/application/staged-media-service";
import {
  importLineId,
  isLineFirst,
} from "../../server/community/domain/catalog-import";
import { autoApplyPolicy } from "../../server/community/domain/confidence";
import {
  communityLimits,
  normalizeName,
} from "../../server/community/domain/policy";
import { CatalogDecisionRepository } from "../../server/community/infrastructure/catalog-decision-repository";
import { ContributionRepository } from "../../server/community/infrastructure/contribution-repository";
import { CommunityLookupRepository } from "../../server/community/infrastructure/lookup-repository";
import { ModerationRepository } from "../../server/community/infrastructure/moderation-repository";
import { R2MediaStorage } from "../../server/media/infrastructure/r2-storage";
import type { ModerationDecisionService } from "../../server/moderation/application/decision-service";
import {
  LineRefresh,
  scoringFromEnv,
} from "../../server/ranking/infrastructure/line-refresh";

const environment = process.argv[2];
if (
  environment !== "local" &&
  environment !== "staging" &&
  environment !== "production"
)
  throw new Error("Choose local, staging or production explicitly.");
const { values, positionals: webs } = parseArgs({
  args: process.argv.slice(3),
  allowPositionals: true,
  options: {
    out: { type: "string" },
    operator: { type: "string" },
    apply: { type: "boolean", default: false },
    expect: { type: "string" },
    limit: { type: "string" },
    only: { type: "string" },
    verify: { type: "boolean", default: false },
    sample: { type: "string", default: "25" },
    "release-review": { type: "string" },
    approval: { type: "string" },
    "confirm-production": { type: "string" },
  },
});
if (!webs.length || !values.out)
  throw new Error(
    'Usage: npm run catalog:import:<local|staging|production> -- "<batch web>"… --out "<folder>" --operator=<user id> [--apply --expect=<hash>] [--limit=<n>] [--only=<source key>] [--verify]',
  );
const out = resolve(values.out);
// The manifest holds the review's internal data and photo names.
if (out === process.cwd() || out.startsWith(process.cwd() + sep))
  throw new Error(
    "Keep the import's manifest and reports outside the repository.",
  );
const limit = values.limit === undefined ? Infinity : Number(values.limit);
if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit <= 0))
  throw new Error("--limit needs a positive whole number.");
if (!Number.isSafeInteger(Number(values.sample)) || Number(values.sample) <= 0)
  throw new Error("--sample needs a positive whole number.");
if (values.apply && values.verify)
  throw new Error("Choose --apply or --verify, not both.");
if (environment === "production" && !values["release-review"])
  throw new Error(
    "Production requires --release-review with the cleaned catalog decisions.",
  );
await mkdir(out, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const built = await buildManifest(webs);
const reviewed = values["release-review"]
  ? await applyReleaseReview(
      built.manifest,
      JSON.parse(await readFile(values["release-review"], "utf8")),
    )
  : null;
const manifest = reviewed?.manifest ?? built.manifest;
const counts = {
  ...built.counts,
  products: manifest.products.length,
  lines: new Set(manifest.products.map((p) => p.facts.line.key)).size,
  brands: new Set(manifest.products.map((p) => normalizeName(p.facts.brand)))
    .size,
  foods: new Set(manifest.products.map((p) => p.facts.food)).size,
  storeLinks: manifest.products.reduce((n, p) => n + p.facts.stores.length, 0),
  photos: Object.fromEntries(
    ["front", "ingredients", "nutrition", "back"].map((slot) => [
      slot,
      manifest.products.reduce(
        (n, p) =>
          n + p.facts.photos.filter((photo) => photo.slot === slot).length,
        0,
      ),
    ]),
  ),
  withoutIngredientsPhoto: manifest.products.filter(
    (p) => !p.facts.photos.some((photo) => photo.slot === "ingredients"),
  ).length,
  formulaUpdates: manifest.formulaUpdates.length,
};
await writeFile(join(out, "manifest.json"), json(manifest));
await writeFile(
  join(out, `plan-${stamp}.json`),
  json({
    hash: manifest.hash,
    counts,
    blocking: built.blocking,
    warnings: built.warnings,
  }),
);
console.log(
  JSON.stringify({
    manifestHash: manifest.hash,
    ...counts,
    blocking: built.blocking.length,
    warnings: built.warnings.length,
  }),
);
if (built.blocking.length) {
  for (const problem of built.blocking.slice(0, 30))
    console.error(`Blocking: ${problem}`);
  console.error(
    `${built.blocking.length} blocking problems; nothing was written. See ${out}.`,
  );
  process.exit(1);
}
if (values.apply && values.expect !== manifest.hash)
  throw new Error(
    `--apply needs --expect=${manifest.hash}, the hash of the manifest a dry run showed.`,
  );
if (!values.operator)
  throw new Error(
    "Name the operator whose account the import is: --operator=<user id>.",
  );

const source = parse(await readFile("wrangler.jsonc", "utf8"));
const config = environment === "local" ? source : source.env[environment];
const databaseId: string = config.d1_databases.find(
  (b: { binding: string }) => b.binding === "DB",
)?.database_id;
const bucket: string = config.r2_buckets.find(
  (b: { binding: string }) => b.binding === "MEDIA_BUCKET",
)?.bucket_name;
if (!databaseId || !bucket)
  throw new Error("The target must configure DB and MEDIA_BUCKET.");
const fullRun = limit === Infinity && !values.only;
if (environment === "production" && values.apply) {
  if (!values.approval)
    throw new Error(
      "Production --apply needs --approval=<successful dry-run report>.",
    );
  assertProductionApproval(
    JSON.parse(await readFile(values.approval, "utf8")),
    {
      databaseId,
      bucket,
      operatorId: values.operator,
      manifestHash: manifest.hash,
      reviewHash: reviewed?.reviewHash ?? null,
      confirmation: values["confirm-production"],
      fullRun,
    },
  );
}
const admins = await adminIds(environment, config.vars);
const commit = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).stdout.trim();
const dirty = Boolean(
  spawnSync("git", ["status", "--porcelain"], {
    encoding: "utf8",
  }).stdout.trim(),
);

await withCatalogPlatform(environment, async ({ DB, MEDIA_BUCKET }) => {
  const lines = new LineRefresh(DB, scoringFromEnv(config.vars));
  const moderation = new ModerationRepository(DB);
  const lookup = new CommunityLookupRepository(DB);
  const contributions = new ContributionService(
    new ContributionRepository(
      DB,
      communityLimits(config.vars.COMMUNITY_LIMITS),
    ),
    lookup,
    moderation,
    // A store proposal never consults automated moderation or photos.
    {} as ModerationDecisionService,
    {} as Pick<StagedMediaService, "decisionImages" | "referenceImage">,
    autoApplyPolicy(config.vars.PROPOSAL_AUTO_APPLY),
    async () => undefined,
    uuid,
  );
  // Owner-reviewed batches use this direct, audited catalog path. They do not
  // enter the user-submission content-safety or Clef moderation pipeline.
  const service = new CatalogImportService(
    DB,
    new R2MediaStorage(MEDIA_BUCKET),
    lookup,
    moderation,
    new CatalogDecisionRepository(moderation, lines),
    lines,
    (actor, key, input) =>
      contributions.proposeImportedRetailer(actor, key, input),
    uuid,
  );

  if (values.verify) {
    const result = await verifyImport({ DB, MEDIA_BUCKET }, manifest, {
      sample: Number(values.sample),
    });
    let previous: string | undefined;
    try {
      previous = (
        JSON.parse(
          await readFile(join(out, `digest-${environment}.json`), "utf8"),
        ) as { digest: string }
      ).digest;
    } catch {
      /* no apply report yet */
    }
    const rebuildEqual =
      previous === undefined ? null : previous === result.digest;
    if (rebuildEqual === false)
      result.problems.push(
        "The imported lines' derived rows differ from the ones the import wrote.",
      );
    await writeFile(
      join(out, `verify-${environment}-${stamp}.json`),
      json({ ...result, ok: result.problems.length === 0, rebuildEqual }),
    );
    console.log(
      JSON.stringify(
        { ...result, ok: result.problems.length === 0, rebuildEqual },
        null,
        2,
      ),
    );
    if (result.problems.length) process.exitCode = 1;
    return;
  }

  const checks = await checkTarget(DB, service, {
    operatorId: values.operator!,
    admins,
    foods: [
      ...new Set([
        ...manifest.products.map(({ facts }) => facts.food),
        ...manifest.formulaUpdates.map(({ facts }) => facts.food),
      ]),
    ],
    stores: IMPORT_STORES,
  });
  if (checks.blocking.length) {
    for (const problem of checks.blocking)
      console.error(`Blocking: ${problem}`);
    process.exitCode = 1;
    return;
  }
  // A line's first product starts it, so firsts go first.
  const ordered = [
    ...manifest.products.filter(({ facts }) => isLineFirst(facts)),
    ...manifest.products.filter(({ facts }) => !isLineFirst(facts)),
  ].filter(({ facts }) => !values.only || facts.sourceKey === values.only);
  const tally = (outcomes: ImportOutcome[]) =>
    outcomes.reduce<Record<string, number>>((counts, outcome) => {
      counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
      return counts;
    }, {});

  // Recheck every intended write before a production apply. A stale or
  // blocked product stops the run before stores, photos or audit rows change.
  if (!values.apply || environment === "production") {
    const pending = { lines: new Set<string>(), stores: checks.pendingStores };
    const outcomes: { sourceKey: string; outcome: ImportOutcome }[] = [];
    for (const { facts } of ordered) {
      const outcome = await service.plan(
        checks.actor,
        facts,
        checks.target,
        pending,
      );
      if (outcome.status === "ready" && isLineFirst(facts))
        pending.lines.add(importLineId(facts.sourceKey));
      outcomes.push({ sourceKey: facts.sourceKey, outcome });
    }
    const formulaOutcomes = fullRun
      ? await Promise.all(
          manifest.formulaUpdates.map(async (update) => ({
            sourceKey: update.facts.sourceKey,
            outcome: await service.planFormulaUpdate(checks.actor, update),
          })),
        )
      : [];
    const report = {
      version: 1,
      environment,
      databaseId,
      bucket,
      operatorId: checks.actor.id,
      reviewHash: reviewed?.reviewHash ?? null,
      fullRun,
      createdAt: new Date().toISOString(),
      manifestHash: manifest.hash,
      storesToAdd: IMPORT_STORES.filter(
        (store) => !checks.target.stores.has(normalizeName(store.name)),
      ).map((store) => store.name),
      outcomes: tally(outcomes.map(({ outcome }) => outcome)),
      formulaUpdates: {
        planned: formulaOutcomes.length,
        outcomes: tally(formulaOutcomes.map(({ outcome }) => outcome)),
      },
      notReady: outcomes
        .filter(
          ({ outcome }) =>
            outcome.status === "blocked" || outcome.status === "changed",
        )
        .concat(
          formulaOutcomes.filter(
            ({ outcome }) =>
              outcome.status === "blocked" || outcome.status === "changed",
          ),
        ),
    };
    await writeFile(
      join(out, `dry-run-${environment}-${stamp}.json`),
      json(report),
    );
    console.log(
      JSON.stringify({ ...report, notReady: report.notReady.length }),
    );
    for (const { sourceKey, outcome } of report.notReady.slice(0, 30))
      console.log(
        `${outcome.status}: ${sourceKey}${"reason" in outcome ? ` (${outcome.reason})` : ""}`,
      );
    if (report.notReady.length) {
      process.exitCode = 1;
      return;
    }
    if (!values.apply) {
      console.log(
        `Dry run only. To write: add --apply --expect=${manifest.hash}`,
      );
      return;
    }
  }

  // A Time Travel bookmark first, so the whole remote run has a recovery point.
  let bookmark: string | null = null;
  if (environment !== "local") {
    const name: string = config.d1_databases.find(
      (binding: { binding: string }) => binding.binding === "DB",
    ).database_name;
    const info = spawnSync(
      process.execPath,
      [
        "node_modules/wrangler/bin/wrangler.js",
        "d1",
        "time-travel",
        "info",
        name,
        "--json",
        "--config",
        "wrangler.jsonc",
        "--env",
        environment,
      ],
      { encoding: "utf8" },
    );
    if (info.status !== 0)
      throw new Error(
        `Could not record a Time Travel bookmark: ${info.stderr}`,
      );
    const record = JSON.parse(info.stdout) as { bookmark?: string };
    bookmark = typeof record.bookmark === "string" ? record.bookmark : null;
    if (!bookmark || !/^[a-f0-9-]{16,}$/.test(bookmark))
      throw new Error("Wrangler returned an invalid Time Travel bookmark.");
    console.log(JSON.stringify({ environment, before: bookmark }));
  }
  // Time Travel includes the FTS tables that D1 SQL export cannot export.
  // Persist this backup reference before any write, including store setup.
  const backup = bookmark
    ? {
        kind: "d1-time-travel",
        databaseId,
        bookmark,
        recordedAt: new Date().toISOString(),
      }
    : null;
  if (environment === "production" && !backup)
    throw new Error(
      "Production backup is unavailable; no import writes were made.",
    );
  const runId = uuid();
  await writeFile(
    join(out, `recovery-${environment}-${runId}.json`),
    json({
      environment,
      databaseId,
      bucket,
      runId,
      bookmark,
      backup,
      manifestHash: manifest.hash,
      reviewHash: reviewed?.reviewHash ?? null,
    }),
    { mode: 0o600, flag: "wx" },
  );
  const progress = join(out, `progress-${environment}-${runId}.jsonl`);
  await service.recordRun(checks.actor, runId, "catalog_import_started", {
    environment,
    manifestHash: manifest.hash,
    batches: manifest.batches,
    commit,
    dirty,
    products: manifest.products.length,
    formulaUpdates: manifest.formulaUpdates.length,
    reviewHash: reviewed?.reviewHash ?? null,
  });
  const stores = await service.ensureStores(checks.actor, IMPORT_STORES, "US");
  const target = { ...checks.target, stores: stores.ids };
  const outcomes: ImportOutcome[] = [];
  let written = 0;
  for (const { facts } of ordered) {
    if (written >= limit) break;
    const paths = built.files.get(facts.sourceKey)!;
    const outcome = await service.importProduct(
      checks.actor,
      { id: runId, manifestHash: manifest.hash },
      facts,
      target,
      async (photo, kind) =>
        new Uint8Array(await readFile(paths.get(photo.slot)![kind])),
    );
    if (outcome.status === "written") written++;
    outcomes.push(outcome);
    await appendFile(
      progress,
      JSON.stringify({ sourceKey: facts.sourceKey, ...outcome }) + "\n",
    );
    if (outcomes.length % 50 === 0)
      console.log(
        `${outcomes.length} of ${ordered.length}: ${JSON.stringify(tally(outcomes))}`,
      );
  }
  const formulaOutcomes: { sourceKey: string; outcome: ImportOutcome }[] = [];
  if (fullRun) {
    for (const update of manifest.formulaUpdates) {
      const sourceKey = update.facts.sourceKey;
      const paths = built.files.get(sourceKey)!;
      const outcome = await service.importFormulaUpdate(
        checks.actor,
        { id: runId, manifestHash: manifest.hash },
        update,
        async (photo, kind) =>
          new Uint8Array(await readFile(paths.get(photo.slot)![kind])),
      );
      formulaOutcomes.push({ sourceKey, outcome });
      await appendFile(
        progress,
        JSON.stringify({
          sourceKey,
          productSourceKey: update.productSourceKey,
          type: "formula_update",
          ...outcome,
        }) + "\n",
      );
    }
  }
  outcomes.push(...formulaOutcomes.map(({ outcome }) => outcome));
  const summary = tally(outcomes);
  await service.recordRun(checks.actor, runId, "catalog_import_finished", {
    manifestHash: manifest.hash,
    storesAdded: stores.created,
    outcomes: summary,
    formulaUpdates: formulaOutcomes.length,
    complete: fullRun,
  });
  const verified = fullRun
    ? await verifyImport({ DB, MEDIA_BUCKET }, manifest, {
        sample: Number(values.sample),
      })
    : null;
  if (verified)
    await writeFile(
      join(out, `digest-${environment}.json`),
      json({ runId, digest: verified.digest }),
    );
  const report = {
    environment,
    runId,
    manifestHash: manifest.hash,
    bookmark,
    backup,
    commit,
    dirty,
    storesAdded: stores.created,
    outcomes: summary,
    blocked: outcomes.filter(
      (outcome) => outcome.status === "blocked" || outcome.status === "changed",
    ),
    verification: verified ?? "Skipped for a bounded or targeted import.",
  };
  await writeFile(
    join(out, `report-${environment}-${runId}.json`),
    json(report),
  );
  console.log(
    JSON.stringify(
      {
        environment,
        runId,
        storesAdded: stores.created,
        outcomes: summary,
        verified: verified?.ok ?? null,
        problems: verified?.problems.slice(0, 10) ?? [],
      },
      null,
      2,
    ),
  );
  if (report.blocked.length || (fullRun && !verified?.ok)) process.exitCode = 1;
});
