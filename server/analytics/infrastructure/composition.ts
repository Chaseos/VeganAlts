import { ProductAnalyticsService } from "../application/service";
import { D1ProductAnalyticsRepository } from "./d1-repository";

export const productAnalyticsService = (env: Pick<Cloudflare.Env, "DB">) =>
  new ProductAnalyticsService(new D1ProductAnalyticsRepository(env.DB));
