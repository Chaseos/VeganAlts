import { TrendingService } from "../application/trending-service";
import { trendingParameters } from "../domain/trending";
import { validateRankingParameters } from "../domain/policy";
import { D1TrendingRepository } from "./d1-trending-repository";

export const trendingService = (
  env: Pick<
    Cloudflare.Env,
    "DB" | "RANKING_PRIOR_MEAN" | "RANKING_PRIOR_STRENGTH"
  > & { RANKING_TRENDING?: string },
  clock = Date.now,
) =>
  new TrendingService(
    new D1TrendingRepository(env.DB),
    trendingParameters(env.RANKING_TRENDING),
    validateRankingParameters({
      priorMean: Number(env.RANKING_PRIOR_MEAN),
      priorStrength: Number(env.RANKING_PRIOR_STRENGTH),
    }),
    clock,
  );
