import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import { PageShell } from "../components/layout/page-shell";
import { InstantSearch } from "../components/catalog/instant-search";
import { FoodCard } from "../components/catalog/aisle-panel";
import { ProductThumbnail } from "../components/catalog/product-thumbnail";
import { FoodIcon } from "../components/icons/food-icons";
import { ScoreLabel } from "../components/ui/score";
import { Badge } from "../components/ui/badges";
import { ButtonLink } from "../components/ui/button";
import { EmptyState } from "../components/ui/feedback";
import { publicMetadata } from "../lib/metadata";
import { joinList, plural, productName } from "../lib/format";
import {
  brandPath,
  foodPath,
  productPath,
  searchPath,
  useSiteChrome,
} from "../lib/site-chrome";
import type { Route } from "./+types/search";

export async function loader({ request, params }: Route.LoaderArgs) {
  requireCatalogPreview(env);
  return publicLoader(async () => {
    const catalog = catalogService(env);
    const market = await catalog.market(params.country);
    return {
      ...(await catalog.searchResults(
        market,
        new URL(request.url).searchParams.get("q") ?? "",
      )),
      market,
      origin: env.APP_URL,
      staging: env.APP_ENV !== "production",
    };
  });
}
// Switching country keeps the query.
export const handle = {
  countrySwitch: (data: unknown, code: string) => {
    const query = (data as { query?: string } | undefined)?.query;
    return `${searchPath(code)}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  },
};
export function meta({ loaderData }: Route.MetaArgs) {
  const market = loaderData?.market;
  return publicMetadata(
    loaderData?.query ? `Search for ${loaderData.query}` : "Search every food",
    `Explore vegan alternatives by food, brand or product. Browse the ${market?.name ?? "United States"} catalog.`,
    `${searchPath(market?.code ?? "us")}${loaderData?.query ? `?q=${encodeURIComponent(loaderData.query)}` : ""}`,
    loaderData?.origin ?? "https://veganalts.com",
    loaderData?.staging ?? true,
  ).concat(
    // Query results are thin, unbounded pages; crawlers follow their links.
    loaderData?.query && !loaderData.staging
      ? [{ name: "robots", content: "noindex, follow" }]
      : [],
  );
}

// The full search page: every matching food with its top three, then products
// with where each ranks. Without a query it lists every aisle.
export default function Search({ loaderData: data }: Route.ComponentProps) {
  const code = data.market.code;
  const found = data.foods.length + data.brands.length + data.products.length;
  return (
    <PageShell search={false}>
      <header className="va-search-page__head">
        <h1 className="va-display-l">
          {data.query ? `Results for “${data.query}”` : "Search every food"}
        </h1>
        {data.query && (
          <p className="va-muted">
            {joinList([
              plural(data.foods.length, "food"),
              // Brands are named only when some match.
              ...(data.brands.length
                ? [plural(data.brands.length, "brand")]
                : []),
              plural(data.products.length, "product"),
            ])}{" "}
            in {data.market.name}
          </p>
        )}
        <InstantSearch
          key={data.query}
          country={code}
          variant="hero"
          id="page-search"
          query={data.query}
        />
      </header>
      {!data.query ? (
        <AllAisles country={code} />
      ) : (
        <>
          {data.foods.length > 0 && (
            <section
              className="va-search-page__section"
              aria-labelledby="foods-title"
            >
              <h2 id="foods-title" className="va-heading-m">
                Foods
              </h2>
              <ul className="va-food-grid">
                {data.foods.map((food) => (
                  <li key={food.slug}>
                    <FoodCard
                      country={code}
                      food={food}
                      place={food.aisle ?? undefined}
                      level={3}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.brands.length > 0 && (
            <section
              className="va-search-page__section"
              aria-labelledby="brands-title"
            >
              <h2 id="brands-title" className="va-heading-m">
                Brands
              </h2>
              <ul className="va-divided va-card va-search-page__products">
                {data.brands.map((brand) => (
                  <li key={brand.slug}>
                    <Link
                      className="va-row-link"
                      to={brandPath(code, brand.slug)}
                    >
                      <span className="va-row-link__text">
                        <span className="va-row-link__title">{brand.name}</span>
                        <span className="va-small va-muted">
                          {plural(brand.productCount, "product")} in{" "}
                          {data.market.name}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {data.products.length > 0 && (
            <section
              className="va-search-page__section"
              aria-labelledby="products-title"
            >
              <h2 id="products-title" className="va-heading-m">
                Products
              </h2>
              <ul className="va-divided va-card va-search-page__products">
                {data.products.map((product) => (
                  <li key={product.slug}>
                    <Link
                      className="va-row-link"
                      to={productPath(code, product.slug, product.food.slug)}
                    >
                      <ProductThumbnail
                        imageId={product.imageId}
                        food={product.food.slug}
                      />
                      <span className="va-row-link__text">
                        <span className="va-row-link__title">
                          {productName(product.name, product.brand)}
                        </span>
                        <span className="va-small va-muted">
                          {[
                            product.rank
                              ? `Closest #${product.rank} for ${product.food.name.toLowerCase()}`
                              : `Not ranked yet for ${product.food.name.toLowerCase()}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {product.rank !== null && (
                          <span className="va-small va-muted">
                            Score includes this recipe’s flavors
                          </span>
                        )}
                      </span>
                      {product.early && <Badge tone="early">Early</Badge>}
                      {product.rank !== null && product.score !== null && (
                        <ScoreLabel
                          value={product.score}
                          size="compact"
                          tone={product.rank === 1 ? "tag" : "neutral"}
                        />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!found && (
            <EmptyState
              title={`No foods, brands or products match “${data.query}” yet`}
              actions={
                <>
                  <ButtonLink
                    to={`/propose-category?country=${code}&name=${encodeURIComponent(data.query)}`}
                  >
                    Suggest a food
                  </ButtonLink>
                  <ButtonLink
                    variant="secondary"
                    to={`/add-product?country=${code}`}
                  >
                    Add a product
                  </ButtonLink>
                </>
              }
            >
              Check the spelling or try a broader food, such as beef, cheese or
              milk.
            </EmptyState>
          )}
        </>
      )}
    </PageShell>
  );
}

function AllAisles({ country }: { country: string }) {
  const { aisles } = useSiteChrome();
  return (
    <ul className="va-search-page__aisles">
      {aisles.map((aisle) => (
        <li key={aisle.slug} className="va-card">
          <Link
            className="va-browse__summary"
            to={foodPath(country, aisle.slug)}
          >
            <span className="va-browse__tile" aria-hidden="true">
              <FoodIcon slug={aisle.slug} size={22} />
            </span>
            <span className="va-browse__name">{aisle.name}</span>
          </Link>
          <ul className="va-divided">
            {aisle.foods.map((food) => (
              <li key={food.slug}>
                <Link className="va-row-link" to={foodPath(country, food.slug)}>
                  <span className="va-row-link__text">
                    <span className="va-row-link__title">{food.name}</span>
                    <span className="va-small va-muted">
                      {plural(food.productCount, "product")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
