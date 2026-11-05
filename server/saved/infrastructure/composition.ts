import { SavedProductsService } from "../application/service";
import { D1SavedProductsRepository } from "./d1-repository";

export const savedProductsService = (env: Pick<Cloudflare.Env, "DB">) =>
  new SavedProductsService(new D1SavedProductsRepository(env.DB));
