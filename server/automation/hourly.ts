import { moderationDecisions } from "../moderation/infrastructure/composition";
import { commentServices } from "../comments/infrastructure/composition";
import { communityServices } from "../community/infrastructure/composition";
import { taxonomyServices } from "../taxonomy/infrastructure/composition";

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
  const decisions = moderationDecisions(env);
  await step("expiredDecisionLeases", () => decisions.expireLeases());
  await step("releasedComments", () => commentServices(env).reevaluateHeld());
  await step("acceptedProposals", () =>
    communityServices(env).moderation.sweepProposals(),
  );
  await step("continuedMerges", () =>
    taxonomyServices(env).continueInterrupted(),
  );
  return { ...summary, failed };
}
