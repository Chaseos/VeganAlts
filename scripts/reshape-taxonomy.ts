// Re-parents existing local or staging categories into the three-level launch
// tree (Food → aisle → shelf → food) through the audited, reversible taxonomy
// update path. Run the taxonomy seed first so every group exists. Production
// never needs this: it receives the shape from the seed.
//
//   npm run taxonomy:reshape:local -- [--apply] [--operator=<user id>]
//   npm run taxonomy:reshape:staging -- --operator=<allowlisted user id> [--apply]
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getPlatformProxy } from "wrangler";
import { parse } from "jsonc-parser";
import { v7 as uuid } from "uuid";
import { TaxonomyService } from "../server/taxonomy/application/taxonomy-service";
import { D1TaxonomyRepository } from "../server/taxonomy/infrastructure/d1-taxonomy-repository";
import { ModerationRepository } from "../server/community/infrastructure/moderation-repository";
import { RatingsService } from "../server/ratings/application/service";
import { D1RatingsRepository } from "../server/ratings/infrastructure/d1-repository";
import { validateRankingParameters } from "../server/ranking/domain/policy";
import { rebuildSearchIndex } from "../server/catalog/infrastructure/search-index";
import { taxonomyShape } from "../server/taxonomy/domain/shape";
import { SYSTEM_ACTOR_ID } from "../server/community/domain/policy";
import type { ModerationDecisionService } from "../server/moderation/application/decision-service";
import { TAXONOMY_GROUPS, TAXONOMY_LEAVES } from "../db/seed/taxonomy";

const environment = process.argv[2];
if (environment !== "local" && environment !== "staging")
  throw new Error(
    "Choose local or staging. Production receives the shape from the taxonomy seed.",
  );
const apply = process.argv.includes("--apply");
const operatorArg = process.argv
  .find((arg) => arg.startsWith("--operator="))
  ?.slice("--operator=".length);
const source = parse(await readFile("wrangler.jsonc", "utf8"));
const target = environment === "local" ? source : source.env.staging;
const operatorId =
  operatorArg ?? (environment === "local" ? SYSTEM_ACTOR_ID : undefined);
if (!operatorId)
  throw new Error("Staging changes are recorded under --operator=<user id>.");
if (
  environment === "staging" &&
  !String(target.vars.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id: string) => id.trim())
    .includes(operatorId)
)
  throw new Error("The operator must be in staging's ADMIN_USER_IDS.");

const directory = await mkdtemp(join(tmpdir(), "veganalts-reshape-"));
try {
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      name: `veganalts-reshape-${environment}`,
      account_id: source.account_id,
      compatibility_date: source.compatibility_date,
      d1_databases: target.d1_databases.map(
        (database: Record<string, unknown>) => ({
          ...database,
          remote: environment !== "local",
        }),
      ),
    }),
  );
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath,
    remoteBindings: environment !== "local",
    persist: { path: resolve(".wrangler/state/v3") },
  });
  try {
    const db = proxy.env.DB;
    const ratings = new RatingsService(
      new D1RatingsRepository(db),
      validateRankingParameters({
        priorMean: Number(target.vars.RANKING_PRIOR_MEAN),
        priorStrength: Number(target.vars.RANKING_PRIOR_STRENGTH),
      }),
      uuid,
    );
    const service = new TaxonomyService(
      new D1TaxonomyRepository(new ModerationRepository(db), uuid),
      // Parent moves never consult automated moderation.
      {} as ModerationDecisionService,
      {
        rebuildVersions: (ids) => ratings.rebuildVersions(ids),
        rebuildSearch: () => rebuildSearchIndex(db),
        refreshTrending: async () => {},
        // The next deploy rolls every cache key; there is no shared cache locally.
        invalidate: async () => {},
      },
      uuid,
    );
    const actor = {
      id: operatorId,
      accountState: "active",
      administrator: true,
    };
    const tree = await service.tree(actor);
    const bySlug = new Map(tree.categories.map((c) => [c.slug, c]));
    const wanted = [
      ...TAXONOMY_GROUPS.map((g) => ({ ...g, rankable: false })),
      ...TAXONOMY_LEAVES.map((l) => ({ ...l, rankable: true })),
    ];
    const problems: string[] = [];
    for (const item of wanted) {
      const found = bySlug.get(item.slug);
      if (!found)
        problems.push(`${item.slug} is missing; run the taxonomy seed first`);
      else if (!found.isActive) problems.push(`${item.slug} is retired`);
      else if (!!found.isRankable !== item.rankable)
        problems.push(
          `${item.slug} should ${item.rankable ? "" : "not "}be rankable`,
        );
    }
    if (tree.merges.some((merge) => merge.state !== "complete"))
      problems.push("a category merge is unfinished");
    if (problems.length) {
      console.error(JSON.stringify({ environment, problems }, null, 2));
      process.exit(1);
    }
    // Top-down, so each aisle sits under Food before its shelves move.
    const moves = wanted.flatMap((item) => {
      const current = bySlug.get(item.slug)!;
      const parentId = item.parent ? bySlug.get(item.parent)!.id : null;
      return current.parentId === parentId
        ? []
        : [
            {
              slug: item.slug,
              id: current.id,
              from:
                tree.categories.find((c) => c.id === current.parentId)?.slug ??
                null,
              to: item.parent,
              parentId,
            },
          ];
    });
    const done: { slug: string; actionId: string }[] = [];
    if (apply)
      for (const move of moves) {
        const fresh = (await service.tree(actor)).categories.find(
          (c) => c.id === move.id,
        )!;
        const result = (await service.update(
          actor,
          `m5-reshape-${move.slug}-${move.to ?? "root"}`,
          move.id,
          {
            expectedRevision: fresh.revision,
            parentId: move.parentId,
            note: `Milestone 5 three-level taxonomy: ${move.slug} moves under ${move.to ?? "the root"}.`,
          },
        )) as { actionId: string };
        done.push({ slug: move.slug, actionId: result.actionId });
      }
    const after = await service.tree(actor);
    const shape = taxonomyShape(after.categories.filter((c) => c.isActive));
    const outside = after.categories
      .filter((c) => c.isActive && shape.get(c.id)?.outsideDepth)
      .map((c) => c.slug);
    console.log(
      JSON.stringify(
        {
          environment,
          applied: apply,
          moves: moves.map(({ slug, from, to }) => ({ slug, from, to })),
          actions: done,
          // Rankable foods the aisle bar cannot place; review them by hand.
          outsideDepthThree: outside,
        },
        null,
        2,
      ),
    );
  } finally {
    await proxy.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
