// Apply a release review to an existing local/staging catalog through audited
// moderation patches. Production receives the cleaned import manifest instead.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { parseArgs } from "node:util";
import { parse } from "jsonc-parser";
import { v7 as uuid } from "uuid";
import { withCatalogPlatform } from "../catalog-platform";
import { applyReleaseReview } from "./release-review";
import { adminIds } from "./target";
import {
  importIds,
  importManifest,
} from "../../server/community/domain/catalog-import";
import { fingerprint } from "../../server/community/domain/policy";
import { CatalogReviewService } from "../../server/community/application/catalog-review-service";
import { ModerationRepository } from "../../server/community/infrastructure/moderation-repository";
import { CatalogDecisionRepository } from "../../server/community/infrastructure/catalog-decision-repository";
import {
  LineRefresh,
  scoringFromEnv,
} from "../../server/ranking/infrastructure/line-refresh";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { rebuildSearchIndex } from "../../server/catalog/infrastructure/search-index";
import { TaxonomyService } from "../../server/taxonomy/application/taxonomy-service";
import { D1TaxonomyRepository } from "../../server/taxonomy/infrastructure/d1-taxonomy-repository";
import type { ModerationDecisionService } from "../../server/moderation/application/decision-service";
import { trendingService } from "../../server/ranking/infrastructure/trending-composition";
import { TAXONOMY_LEAVES } from "../../db/seed/taxonomy";

const environment = process.argv[2];
if (environment !== "local" && environment !== "staging")
  throw new Error(
    "Cleanup runs on local or staging. Production uses the cleaned importer.",
  );
const { values } = parseArgs({
  args: process.argv.slice(3),
  options: {
    source: { type: "string" },
    review: { type: "string" },
    operator: { type: "string" },
    out: { type: "string" },
    apply: { type: "boolean", default: false },
    expect: { type: "string" },
  },
});
if (!values.source || !values.review || !values.out || !values.operator)
  throw new Error(
    "Supply --source=<manifest>, --review=<release review>, --out=<private folder> and --operator=<id>.",
  );
const out = resolve(values.out);
if (out === process.cwd() || out.startsWith(process.cwd() + sep))
  throw new Error("Keep cleanup snapshots and reports outside the repository.");
await mkdir(out, { recursive: true, mode: 0o700 });
const source = importManifest.parse(
  JSON.parse(await readFile(values.source, "utf8")),
);
const reviewed = await applyReleaseReview(
  source,
  JSON.parse(await readFile(values.review, "utf8")),
);
const configFile = parse(await readFile("wrangler.jsonc", "utf8"));
const config = environment === "local" ? configFile : configFile.env.staging;
if (!(await adminIds(environment, config.vars)).includes(values.operator))
  throw new Error("The operator must be allowlisted for this environment.");
const actor = {
  id: values.operator,
  accountState: "active",
  administrator: true,
};
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await withCatalogPlatform(environment, async ({ DB }) => {
  if (
    (await DB.prepare("SELECT account_state FROM profiles WHERE user_id=?")
      .bind(actor.id)
      .first<string>("account_state")) !== "active"
  )
    throw new Error("The operator is not active in this database.");
  const repository = new ModerationRepository(DB),
    scoring = scoringFromEnv(config.vars);
  const taxonomyRepository = new D1TaxonomyRepository(repository, uuid);
  const tree = await taxonomyRepository.tree();
  const foods = new Map(tree.categories.map((c) => [c.slug, c]));
  const wanted = new Set(
    reviewed.review.decisions.flatMap((d) => (d.food ? [d.food] : [])),
  );
  const additions = TAXONOMY_LEAVES.filter(
    (f) => wanted.has(f.slug) && !foods.has(f.slug),
  );
  for (const slug of wanted)
    if (!foods.has(slug) && !additions.some((f) => f.slug === slug))
      throw new Error(`No reviewed taxonomy definition for ${slug}.`);
  for (const food of additions)
    if (!foods.get(food.parent)?.isActive)
      throw new Error(`Missing aisle ${food.parent}.`);
  const aliasChanges = tree.categories.flatMap((c) => {
    const aliases =
      c.slug === "cake"
        ? c.aliases.filter((a) => a.alias.toLowerCase() !== "banana bread")
        : c.slug === "pies-and-cheesecake"
          ? []
          : c.aliases;
    return aliases.length !== c.aliases.length
      ? [
          {
            id: c.id,
            slug: c.slug,
            revision: c.revision,
            aliases: aliases.map((a) => ({
              alias: a.alias,
              ...(a.country ? { country: a.country } : {}),
              displayName: a.displayName,
            })),
          },
        ]
      : [];
  });
  const products = [];
  for (const d of reviewed.review.decisions.filter(
    (d) => d.decision !== "retain",
  )) {
    const productId = importIds(d.sourceKey).product;
    const key = `release-${reviewed.reviewHash.slice(0, 32)}-${productId}`;
    const previous = await DB.prepare(
      "SELECT result_data FROM contribution_receipts WHERE user_id=? AND operation='catalog-review' AND idempotency_key=?",
    )
      .bind(actor.id, key)
      .first<string>("result_data");
    const snapshot = await repository.snapshot(productId);
    let prior = previous
      ? (JSON.parse(previous) as { actionId: string })
      : null;
    if (prior && (await repository.action(prior.actionId))?.reversed_by)
      throw new Error(
        `The prior cleanup of ${productId} was reversed. Review it again instead of silently reapplying.`,
      );
    if (d.decision === "duplicate") {
      const consolidated = await DB.prepare(
        "SELECT dc.action_id AS actionId FROM duplicate_consolidations dc JOIN moderation_actions a ON a.id=dc.action_id WHERE dc.donor_id=? AND dc.survivor_id=? AND dc.active=1 AND a.reversed_by IS NULL",
      )
        .bind(productId, importIds(d.survivorSourceKey!).product)
        .first<{ actionId: string }>();
      if (!consolidated || snapshot.lifecycleStatus !== "hidden")
        throw new Error(
          `Consolidate the verified duplicate ${productId} through moderation before cleanup.`,
        );
      prior = consolidated;
    }
    const original = source.products.find(
      (p) => p.facts.sourceKey === d.sourceKey,
    )!.facts;
    if (
      !prior &&
      (snapshot.name !== original.name || snapshot.lifecycleStatus === "hidden")
    )
      throw new Error(
        `Product ${productId} differs from the reviewed source. Refresh the review.`,
      );
    products.push({
      productId,
      key,
      decision: d,
      snapshot,
      previousActionId: prior?.actionId ?? null,
    });
  }
  const plan = {
    environment,
    databaseId: config.d1_databases[0].database_id,
    operatorId: actor.id,
    reviewHash: reviewed.reviewHash,
    additions,
    aliasChanges,
    products,
  };
  const hash = await fingerprint(plan);
  const planFile = join(out, `cleanup-${environment}-${stamp}.json`);
  await writeFile(planFile, JSON.stringify({ hash, ...plan }, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await writeFile(
    join(out, "release-manifest.json"),
    JSON.stringify(reviewed.manifest, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      hash,
      planFile,
      products: products.length,
      replayed: products.filter((p) => p.previousActionId).length,
      newFoods: additions.map((f) => f.name),
      releaseProducts: reviewed.manifest.products.length,
    }),
  );
  if (!values.apply) return;
  if (values.expect !== hash)
    throw new Error(
      `Review the cleanup dry run, then use --apply --expect=${hash}.`,
    );
  const ratings = new RatingsService(
    new D1RatingsRepository(DB),
    scoring.closest,
    uuid,
    Date.now,
    scoring.tastiest,
  );
  const cacheSlugs = new Set<string>();
  const taxonomy = new TaxonomyService(
    taxonomyRepository,
    // These operator create/update methods never run automated content checks.
    {} as ModerationDecisionService,
    {
      rebuildVersions: (ids) => ratings.rebuildVersions(ids),
      rebuildSearch: () => rebuildSearchIndex(DB),
      refreshTrending: (ids) =>
        trendingService({ ...config.vars, DB }).refreshCategories(ids),
      // CLI changes have no Worker cache binding. Record the exact affected
      // pages for the deployment that refreshes staging's cache namespace.
      invalidate: async (slugs) => {
        for (const slug of slugs) cacheSlugs.add(slug);
      },
    },
    uuid,
  );
  const actions: {
    productId?: string;
    categoryId?: string;
    actionId: string;
  }[] = [];
  const record = async (action: (typeof actions)[number]) => {
    actions.push(action);
    await writeFile(
      join(out, `cleanup-actions-${environment}-${stamp}.json`),
      JSON.stringify({ hash, actions, cacheSlugs: [...cacheSlugs] }, null, 2) +
        "\n",
      { mode: 0o600 },
    );
  };
  for (const change of aliasChanges) {
    const result = await taxonomy.update(
      actor,
      `release-alias-${reviewed.reviewHash.slice(0, 32)}-${change.id}`,
      change.id,
      {
        expectedRevision: change.revision,
        aliases: change.aliases,
        note: "Release review: free aliases for separate food comparisons.",
      },
    );
    await record({ categoryId: change.id, actionId: result.actionId });
  }
  for (const food of additions) {
    const result = await taxonomy.create(
      actor,
      `release-food-${reviewed.reviewHash.slice(0, 32)}-${food.slug}`,
      {
        name: food.name,
        slug: food.slug,
        parentId: foods.get(food.parent)!.id,
        isRankable: true,
        aliases: [...food.aliases],
        countries: ["US"],
        note: "Release review: separate comparisons for distinct foods.",
      },
    );
    await record({ categoryId: result.categoryId, actionId: result.actionId });
  }
  const currentFoods = new Map(
    (await taxonomyRepository.tree()).categories.map((c) => [c.slug, c.id]),
  );
  const service = new CatalogReviewService(
    repository,
    new CatalogDecisionRepository(repository, new LineRefresh(DB, scoring)),
    uuid,
  );
  for (const product of products) {
    if (product.previousActionId) continue;
    const d = product.decision;
    const result = await service.apply(actor, product.key, product.productId, {
      expectedRevision: product.snapshot.revision,
      decision: d.decision,
      ...(d.food ? { categoryId: currentFoods.get(d.food) } : {}),
      ...(d.separateLine ? { newLineName: d.lineName } : {}),
      note: `${d.reason}${d.evidence.length ? ` Sources: ${d.evidence.join(" ")}` : ""}`,
    });
    await record({ productId: product.productId, actionId: result.actionId });
  }
  for (const slug of ["pies-and-cheesecake", "skillet-meals"]) {
    const foodId = currentFoods.get(slug);
    if (!foodId) continue;
    const food = await taxonomyRepository.category(foodId);
    const eligible = await DB.prepare(
      "SELECT COUNT(*) AS n FROM product_categories pc JOIN products p ON p.id=pc.product_id WHERE pc.category_id=? AND pc.ranking_eligible=1 AND p.lifecycle_status<>'hidden'",
    )
      .bind(foodId)
      .first<number>("n");
    if (food?.isActive && !eligible) {
      const result = await taxonomy.update(
        actor,
        `release-retire-${reviewed.reviewHash.slice(0, 32)}-${foodId}`,
        foodId,
        {
          expectedRevision: food.revision,
          isActive: false,
          note: "Release review: split this broad food into specific comparisons; retain historical memberships.",
        },
      );
      await record({ categoryId: foodId, actionId: result.actionId });
    }
  }
  await trendingService({ ...config.vars, DB }).rebuild();
  for (const p of products) {
    const snapshot = await repository.snapshot(p.productId);
    if (
      (["exclude", "hold"].includes(p.decision.decision) &&
        snapshot.lifecycleStatus !== "hidden") ||
      (p.decision.food &&
        !snapshot.categories.some(
          (c) =>
            c.eligible && c.categoryId === currentFoods.get(p.decision.food!),
        ))
    )
      throw new Error(
        `Cleanup verification failed for ${p.productId}. See the action log for reversible changes.`,
      );
  }
  console.log(
    JSON.stringify({
      verified: true,
      actions: actions.length,
      cacheRefresh:
        environment === "staging"
          ? "Deploy staging to refresh the public cache namespace."
          : "Local pages have no shared cache.",
    }),
  );
});
