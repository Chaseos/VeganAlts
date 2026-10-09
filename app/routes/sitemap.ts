import { env } from "cloudflare:workers";
import { requireCatalogPreview } from "@server/catalog/http/loader";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { POLICIES } from "../content/policies";
import { foodPath, productPath } from "@server/catalog/domain/markets";

const escape = (value: string) =>
  value.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Crawlable public URLs: home, active categories, visible products, policies. */
export async function loader() {
  requireCatalogPreview(env);
  const entries = await catalogService(env).sitemap();
  const origin = env.APP_URL;
  const urls = [
    { path: "/", updatedAt: null as number | null },
    ...entries.categories.map((c) => ({
      path: foodPath("us", c.slug),
      updatedAt: c.updatedAt,
    })),
    ...entries.products.map((p) => ({
      path: productPath(p.country, p.slug),
      updatedAt: p.updatedAt,
    })),
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
