import { moderationDecisions } from "../moderation/infrastructure/composition";
import { trendingService } from "../ranking/infrastructure/trending-composition";
import { commentServices } from "../comments/infrastructure/composition";
import { communityServices } from "../community/infrastructure/composition";
import { invalidateCommunityProduct } from "../community/infrastructure/invalidation";
import { taxonomyServices } from "../taxonomy/infrastructure/composition";
import { lineRefresh } from "../ranking/infrastructure/line-refresh";

/**
 * Hourly automation. Each step is bounded and independent so one failing step
 * cannot stall the others; the caller logs the summary without sensitive data.
 */
export async function runAutomation(env: Cloudflare.Env) {
  const summary: Record<string, number | string> = {};
  const failed: string[] = [];
  const step = async (name: string, work: () => Promise<number>) => {
    try {
      summary[name] = await work();
    } catch {
      failed.push(name);
    }
  };
  await step(
    "trendingCategories",
    async () => (await trendingService(env).refresh()).categories,
  );
  // Writes refresh their lines as they happen; this re-derives every line so
  // a missed write or the moving recent window can't leave one stale.
  await step("refreshedLines", () => lineRefresh(env).refreshAll());
  const decisions = moderationDecisions(env);
  await step("expiredDecisionLeases", () => decisions.expireLeases());
  await step("releasedComments", () => commentServices(env).reevaluateHeld());
  await step("acceptedProposals", async () => {
    const applied = await communityServices(env).moderation.sweepProposals();
    // Automatic acceptance changes public pages just as an operator does.
    for (const change of applied)
      if (change.productId)
        await invalidateCommunityProduct(env.DB, change.productId, {
          actionId: change.actionId,
        });
    return applied.length;
  });
  await step("continuedMerges", () =>
    taxonomyServices(env).continueInterrupted(),
  );
  await step("appliedSubmissionExtras", () =>
    communityServices(env).extras.sweep(),
  );
  await step("continuedFoodSubmissions", async () => {
    const published =
      await communityServices(env).moderation.sweepFoodDecisions();
    for (const { productId } of published)
      await invalidateCommunityProduct(env.DB, productId);
    return published.length;
  });
  return { ...summary, failed };
}
