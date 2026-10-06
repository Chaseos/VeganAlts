import { RatingsService } from "../application/service";
import { PersonalRatingsService } from "../application/personal-service";
import { D1RatingsRepository } from "./d1-repository";
import { D1PersonalRatingsRepository } from "./personal-repository";
import { validateRankingParameters } from "../../ranking/domain/policy";

export const ratingsService = (env: Cloudflare.Env) =>
  new RatingsService(
    new D1RatingsRepository(env.DB),
    validateRankingParameters({
      priorMean: Number(env.RANKING_PRIOR_MEAN),
      priorStrength: Number(env.RANKING_PRIOR_STRENGTH),
    }),
    () => crypto.randomUUID(),
  );
export const personalRatingsService = (env: Pick<Cloudflare.Env, "DB">) =>
  new PersonalRatingsService(new D1PersonalRatingsRepository(env.DB));
