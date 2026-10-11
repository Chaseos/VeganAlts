import { waitUntil } from "cloudflare:workers";
import { v7 as uuid } from "uuid";
import { ModerationRepository } from "../../community/infrastructure/moderation-repository";
import { moderationDecisions } from "../../moderation/infrastructure/composition";
import { ratingsService } from "../../ratings/infrastructure/composition";
import { rebuildSearchIndex } from "../../catalog/infrastructure/search-index";
import { trendingService } from "../../ranking/infrastructure/trending-composition";
import { scheduleCatalogInvalidation } from "../../catalog/infrastructure/invalidation";
import { communityServices } from "../../community/infrastructure/composition";
import { invalidateCommunityProduct } from "../../community/infrastructure/invalidation";
import { TaxonomyService } from "../application/taxonomy-service";
import { D1TaxonomyRepository } from "./d1-taxonomy-repository";

export function taxonomyServices(
  env: Cloudflare.Env,
  newId: () => string = uuid,
  clock = Date.now,
) {
  return new TaxonomyService(
    new D1TaxonomyRepository(new ModerationRepository(env.DB), newId),
    moderationDecisions(env, newId, clock),
    {
      rebuildVersions: (ids) => ratingsService(env).rebuildVersions(ids),
      rebuildSearch: () => rebuildSearchIndex(env.DB),
      // The merge is committed; a failure here is repaired by the nightly
      // full-window pass, so it must not report the merge as failed.
      refreshTrending: async (categoryIds) => {
        try {
          await trendingService(env, clock).refreshCategories(categoryIds);
        } catch {
          console.error(JSON.stringify({ event: "taxonomy_trending_failed" }));
        }
      },
      // Products waiting on a decided food continue after the operator's
      // response (each publication can run automated checks); each one
      // published purges its pages. The hourly sweep finishes the rest.
      foodDecided: async (proposalId) => {
        waitUntil(
          (async () => {
            const published = await communityServices(
              env,
              newId,
              clock,
            ).moderation.continueAfterFood(proposalId);
            for (const { productId } of published)
              await invalidateCommunityProduct(env.DB, productId);
          })().catch(() =>
            console.error(
              JSON.stringify({ event: "food_continuation_failed", proposalId }),
            ),
          ),
        );
      },
      // Category changes purge category, home, search and product surfaces.
      invalidate: async (slugs) => {
        // Persistence already succeeded; a purge failure is bounded by TTLs.
        try {
          scheduleCatalogInvalidation(
            (slugs.length ? slugs : ["home"]).map((slug) => ({
              kind: "category" as const,
              slug,
            })),
          );
        } catch {
          console.error(
            JSON.stringify({ event: "taxonomy_invalidation_failed" }),
          );
        }
      },
    },
    newId,
    clock,
  );
}
