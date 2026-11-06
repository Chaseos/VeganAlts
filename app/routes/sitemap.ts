import { env } from "cloudflare:workers";
import { requireCatalogPreview } from "@server/catalog/http/loader";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { languagesOf, type Language } from "@server/catalog/domain/languages";
import { POLICIES } from "../content/policies";
import {
  brandPath,
  foodPath,
  homePath,
  productPath,
} from "@server/catalog/domain/markets";

const escape = (value: string) =>
  value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Crawlable public URLs: country homes, foods and aisles, products, policies. */
export async function loader() {
  requireCatalogPreview(env);
  const entries = await catalogService(env).sitemap();
  const origin = env.APP_URL;
  // Foods are listed in the countries where they are on, and aisles in the
  // countries that hold one of their foods.
  const open = new Set(entries.countries);
  // Each page once per language its country offers.
  const pages = <T extends { country: string }>(
    rows: T[],
    path: (row: T, language: Language) => string,
    updatedAt: (row: T) => number | null,
  ) =>
    rows.flatMap((row) =>
      languagesOf(row.country).map((language) => ({
        path: path(row, language),
        updatedAt: updatedAt(row),
      })),
    );
  const urls = [
    ...pages(
      entries.countries.map((country) => ({ country })),
      (row, language) => homePath(row.country, language),
      () => null,
    ),
    ...pages(
      entries.categories.filter((c) => open.has(c.country)),
      (c, language) => foodPath(c.country, c.slug, language),
      (c) => c.updatedAt,
    ),
    ...pages(
      entries.products,
      (p, language) => productPath(p.country, p.slug, null, language),
      (p) => p.updatedAt,
    ),
    ...pages(
      entries.brands,
      (b, language) => brandPath(b.country, b.slug, language),
      (b) => b.updatedAt,
    ),
    ...Object.keys(POLICIES).map((slug) => ({
      path: `/about/${slug}`,
      updatedAt: null,
    })),
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${escape(new URL(u.path, origin).href)}</loc>${u.updatedAt ? `<lastmod>${new Date(u.updatedAt).toISOString().slice(0, 10)}</lastmod>` : ""}</url>`,
  )
  .join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
