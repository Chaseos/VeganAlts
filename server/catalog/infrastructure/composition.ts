import { CatalogService } from "../application/service";
import { trendingParameters } from "../../ranking/domain/trending";
import { D1CatalogRepository } from "./d1-repository";

export const catalogService = (
  env: Pick<Cloudflare.Env, "DB"> & { RANKING_TRENDING?: string },
) =>
  new CatalogService(
    new D1CatalogRepository(env.DB),
    Date.now,
    // New uses the same configured window as the Trending pass.
    trendingParameters(env.RANKING_TRENDING).newDays,
  );
