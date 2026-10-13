import { CatalogService } from "../application/service";
import { trendingParameters } from "../../ranking/domain/trending";
import { D1CatalogRepository } from "./d1-repository";

export const catalogService = (
  env: Pick<Cloudflare.Env, "DB"> & { RANKING_TRENDING?: string },
) => {
  // New and the Trending tag use the same configuration as the Trending pass.
  const trending = trendingParameters(env.RANKING_TRENDING);
  return new CatalogService(
    new D1CatalogRepository(env.DB),
    Date.now,
    trending.newDays,
    trending.taggedLines,
  );
};
