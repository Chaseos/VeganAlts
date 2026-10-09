import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import {
  CategoryCards,
  EmptyState,
  ProductRows,
  SearchForm,
  SiteShell,
} from "../components/catalog";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/search";

export async function loader({ request }: Route.LoaderArgs) {
  requireCatalogPreview(env.APP_ENV);
  return publicLoader(async () => {
    const catalog = catalogService(env);
    const result = await catalog.search(
      new URL(request.url).searchParams.get("q") ?? "",
    );
    return {
      ...result,
      allCategories: result.query ? [] : (await catalog.home()).categories,
      origin: env.APP_URL,
      staging: env.APP_ENV !== "production",
    };
  });
}
export function meta({ loaderData }: Route.MetaArgs) {
  return publicMetadata(
    loaderData?.query
      ? `Search for ${loaderData.query}`
      : "Discover alternatives",
    "Explore vegan alternatives by food, brand or product. Browse the United States catalog.",
    `/us/search${loaderData?.query ? `?q=${encodeURIComponent(loaderData.query)}` : ""}`,
    loaderData?.origin ?? "https://veganalts.com",
    loaderData?.staging ?? true,
  );
}
export default function Search({ loaderData: data }: Route.ComponentProps) {
  return (
    <SiteShell>
      <header className="page-heading">
        <p className="eyebrow">Discover · United States</p>
        <h1>Find your next good swap.</h1>
        <SearchForm query={data.query} />
      </header>
      {!data.query ? (
        <section className="section-space">
          <h2>Browse all categories</h2>
          <CategoryCards categories={data.allCategories} />
        </section>
      ) : (
        <>
          <h2 className="results-heading">Results for “{data.query}”</h2>
          {!!data.categories.length && (
            <section className="section-space">
              <h2>Categories</h2>
              <CategoryCards categories={data.categories} />
            </section>
          )}
          {!!data.products.length && (
            <section className="section-space">
              <h2>Products</h2>
              <ProductRows products={data.products} />
            </section>
          )}
          {!data.categories.length && !data.products.length && (
            <EmptyState title="No alternatives found yet.">
              Try a broader food name, such as beef, cheese or milk, or browse a
              category. <Link to="/add-product">Add a missing product →</Link>{" "}
              <Link
                to={`/propose-category?name=${encodeURIComponent(data.query)}`}
              >
                Propose a missing category →
              </Link>
            </EmptyState>
          )}
        </>
      )}
    </SiteShell>
  );
}
