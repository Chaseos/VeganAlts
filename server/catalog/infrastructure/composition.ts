import { CatalogService } from "../application/service";
import type { CatalogRepository } from "../domain/contracts";
import type { Language } from "../domain/languages";
import { trendingParameters } from "../../ranking/domain/trending";
import { D1CatalogRepository } from "./d1-repository";
import { PublicCatalogRepository } from "./public-repository";
import { ReadMemo } from "./read-memo";

type CatalogEnv = Pick<Cloudflare.Env, "DB"> & { RANKING_TRENDING?: string };

const service = (env: CatalogEnv, repository: CatalogRepository) => {
  // New and the Trending tag use the same configuration as the Trending pass.
  const trending = trendingParameters(env.RANKING_TRENDING);
  return new CatalogService(
    repository,
    Date.now,
    trending.newDays,
    trending.taggedLines,
  );
};

export const catalogService = (env: CatalogEnv) =>
  service(env, new D1CatalogRepository(env.DB));

const sharedReads = new ReadMemo();

/**
 * For public page loaders only: their output is shared-cacheable and may be
 * minutes stale, so they can use any read replica and the shared reads. Writes,
 * and reads that decide or validate a write, use `catalogService`.
 */
export const publicCatalogService = (
  env: CatalogEnv & { APP_ENV: string },
  language: Language = "en",
) =>
  service(
    env,
    new PublicCatalogRepository(
      env.DB.withSession("first-unconstrained"),
      // Local databases are reset and reseeded under running tests.
      env.APP_ENV === "local" ? null : sharedReads,
      language,
    ),
  );
