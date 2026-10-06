import { requireUser, getOptionalUser } from "../../auth/application/session";
import { BetterAuthSessionReader } from "../../auth/infrastructure/session-reader";
import { ratingInput, type RatingState } from "../domain/contracts";
import {
  personalRatingsService,
  ratingsService,
} from "../infrastructure/composition";
import { ApplicationError } from "../../shared/domain/errors";
import { requireSameOrigin } from "../../shared/http/security";
import { limitedJson, success } from "../../shared/http/json";
import { protectContribution } from "../../abuse/service";
import { recordEvent } from "../../observability/events";

export async function ratingState(request: Request, env: Cloudflare.Env) {
  const user = await getOptionalUser(request, new BetterAuthSessionReader(env));
  const personal = await personalRatingsService(env).state(
    user?.id ?? null,
    new URL(request.url).searchParams.get("versionIds") ?? "",
  );
  const state: RatingState = {
    ...personal,
    user: user
      ? { handle: user.profile.handle, displayName: user.profile.displayName }
      : null,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
  };
  return success(state, {}, true);
}

export async function myRatings(request: Request, env: Cloudflare.Env) {
  const user = await requireUser(request, new BetterAuthSessionReader(env));
  const result = await personalRatingsService(env).list(
    user.id,
    new URL(request.url).searchParams.get("cursor"),
  );
  return success(result.items, { nextCursor: result.nextCursor }, true);
}

export async function saveRating(request: Request, env: Cloudflare.Env) {
  try {
    if (request.method !== "PUT")
      throw new ApplicationError(
        "METHOD_NOT_ALLOWED",
        "Use PUT to save a rating.",
        405,
      );
    requireSameOrigin(request, env.APP_URL);
    const user = await requireUser(request, new BetterAuthSessionReader(env));
    const parsed = ratingInput.safeParse(await limitedJson(request));
    if (!parsed.success)
      throw new ApplicationError(
        "INVALID_RATING",
        "Choose a whole-number score from 1 to 5 for a valid formula and category.",
      );
    const input = parsed.data;
    await protectContribution(
      request,
      env,
      "rating",
      user.id,
      input.challengeToken,
    );
    const saved = await ratingsService(env).rate(
      { id: user.id, accountState: user.profile.accountState },
      input.productVersionId,
      input.categoryId,
      input.overallSimilarity,
    );
    if (saved.outcome !== "unchanged")
      recordEvent(
        env,
        saved.outcome === "created" ? "rating_created" : "rating_updated",
        "rating",
      );
    return success(saved, {}, true);
  } catch (error) {
    recordEvent(
      env,
      "rating_save_failed",
      "rating",
      error instanceof ApplicationError ? error.code : "INTERNAL_ERROR",
    );
    throw error;
  }
}
