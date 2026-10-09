import { env } from "cloudflare:workers";
import { Link, redirect } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  catalogPage,
  CATALOG_PAGE_SIZE,
} from "@server/catalog/application/service";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import {
  CategoryCards,
  EmptyState,
  Pagination,
  ProductRows,
  RankingExplanation,
  SiteShell,
} from "../components/catalog";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/category";

export async function loader({ request, params }: Route.LoaderArgs) {
  requireCatalogPreview(env.APP_ENV);
  // A renamed or merged category redirects (uncached) to its current slug.
  const moved = await catalogService(env).categoryRedirect(params.categorySlug);
  if (moved)
    throw redirect(`/us/${moved}${new URL(request.url).search}`, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  return publicLoader(async () => {
    const url = new URL(request.url);
    return {
      ...(await catalogService(env).category(
        params.categorySlug,
        catalogPage(url.searchParams.get("page")),
        catalogPage(url.searchParams.get("unrankedPage")),
      )),
      origin: env.APP_URL,
      staging: env.APP_ENV !== "production",
    };
  });
}
export function meta({ loaderData: data }: Route.MetaArgs) {
  return publicMetadata(
    data
      ? `Best vegan alternatives to ${data.category.name.toLowerCase()}`
      : "Category",
    `Compare vegan ${data?.category.name.toLowerCase() ?? "food"} alternatives, ranked by similarity with rating counts and formula details.`,
    `/us/${data?.category.slug ?? ""}${data && data.page > 1 ? `?page=${data.page}` : ""}`,
    data?.origin ?? "https://veganalts.com",
    data?.staging ?? true,
  );
}
export default function Category({ loaderData: data }: Route.ComponentProps) {
  return (
    <SiteShell>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link to="/us/search">Discover</Link>
        <span aria-hidden="true">/</span>
        <span>{data.category.name}</span>
      </nav>
      <header className="page-heading">
        <p className="eyebrow">United States · Alternatives to</p>
        <h1>{data.category.name}</h1>
        <p>All the familiar flavor. A different way to get there.</p>
        <Link
          className="text-link"
          to={`/add-product?category=${data.category.id}`}
        >
          Know another alternative? Add a product →
        </Link>
      </header>
      {!!data.children.length && (
        <section className="section-space">
          <h2>Explore a category</h2>
          <CategoryCards categories={data.children} />
        </section>
      )}
      {!!data.category.isRankable && (
        <>
          <div className="ranking-heading">
            <h2>
              Top alternatives <span>{data.category.productCount}</span>
            </h2>
            <span>Ranked by similarity</span>
          </div>
          <RankingExplanation />
          {data.ranked.length ? (
            <ProductRows
              products={data.ranked}
              start={(data.page - 1) * CATALOG_PAGE_SIZE + 1}
              categoryId={data.category.id}
            />
          ) : (
            <EmptyState
              title={
                data.page > 1
                  ? "You’ve reached the end."
                  : "A fresh start for this category."
              }
            >
              Be the first to share how close an alternative comes.
            </EmptyState>
          )}
          <Pagination page={data.page} hasNext={data.hasNext} />
          {(!!data.unranked.length || data.unrankedPage > 1) && (
            <section className="section-space">
              <div className="section-heading">
                <div>
                  <h2>Waiting for a first rating</h2>
                  <p>
                    These alternatives are unranked. Tried one? Share your
                    experience.
                  </p>
                </div>
              </div>
              <ProductRows
                products={data.unranked}
                categoryId={data.category.id}
                unranked
              />
              <Pagination
                page={data.unrankedPage}
                hasNext={data.hasNextUnranked}
                parameter="unrankedPage"
                label="Unranked products"
              />
            </section>
          )}
        </>
      )}
    </SiteShell>
  );
}
