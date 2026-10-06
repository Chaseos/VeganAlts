import { CatalogService } from "../application/service";
import { D1CatalogRepository } from "./d1-repository";

export const catalogService = (env: Pick<Cloudflare.Env, "DB">) =>
  new CatalogService(new D1CatalogRepository(env.DB));
