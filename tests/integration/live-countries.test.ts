import { env } from "cloudflare:workers";
import { beforeAll, expect, it } from "vitest";
import {
  PRODUCTION_COUNTRIES,
  taxonomySeedStatements,
} from "../../db/seed/taxonomy";
import { CatalogService } from "../../server/catalog/application/service";
import { D1CatalogRepository } from "../../server/catalog/infrastructure/d1-repository";

const catalog = new CatalogService(new D1CatalogRepository(env.DB));

beforeAll(async () => {
  await env.DB.prepare("DELETE FROM category_countries").run();
  await env.DB.batch(
    taxonomySeedStatements(() => crypto.randomUUID(), Date.now(), {
      liveCountries: PRODUCTION_COUNTRIES,
    }).map((sql) => env.DB.prepare(sql)),
  );
});

it("opens only the production countries", async () => {
  expect((await catalog.markets()).map((row) => row.market.code)).toEqual([
    "us",
  ]);
  expect((await catalog.page("us")).countries).toHaveLength(1);
  for (const code of ["ca", "de", "jp"])
    await expect(catalog.market(code)).rejects.toMatchObject({ status: 404 });
});

it("lists nothing from a closed country in the sitemap", async () => {
  const sitemap = await catalog.sitemap();
  expect(sitemap.countries).toEqual(["us"]);
  const countries = new Set(
    Object.values(sitemap)
      .flat()
      .map((row) => (row as { country?: string }).country),
  );
  expect([...countries].filter((code) => code && code !== "us")).toEqual([]);
});
