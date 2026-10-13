import { RatingsService } from "../application/service";
import { PersonalRatingsService } from "../application/personal-service";
import { D1RatingsRepository } from "./d1-repository";
import { D1PersonalRatingsRepository } from "./personal-repository";
import { scoringFromEnv } from "../../ranking/infrastructure/line-refresh";

export const ratingsService = (env: Cloudflare.Env) => {
  const scoring = scoringFromEnv(env);
  return new RatingsService(
    new D1RatingsRepository(env.DB),
    scoring.closest,
    () => crypto.randomUUID(),
    Date.now,
    scoring.tastiest,
  );
};
export const personalRatingsService = (env: Pick<Cloudflare.Env, "DB">) =>
  new PersonalRatingsService(new D1PersonalRatingsRepository(env.DB));
