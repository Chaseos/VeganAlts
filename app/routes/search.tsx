import { ApplicationError } from "@server/shared/domain/errors";
import { env } from "cloudflare:workers";
import { batchSection } from "@server/catalog/domain/batches";
import { Link, useLocation } from "react-router";
import { useCallback } from "react";
import {
  BatchItems,
  SeeMore,
  useBatches,
} from "../components/catalog/see-more";
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
import { groupCategories } from "../lib/navigation-groups";
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
    const continuation = new URL(request.url).searchParams;
    if (continuation.has("cursor") && !continuation.has("section"))
      throw new ApplicationError(
        "INVALID_CURSOR",
        "Choose a results section before continuing.",
      );
    const catalog = catalogService(env);
    const market = await catalog.market(params.country);
    return {
      ...(await catalog.searchResults(
        market,
        new URL(request.url).searchParams.get("q") ?? "",
        batchSection(new URL(request.url).searchParams.get("section"), [
          "foods",
          "products",
          "brands",
        ] as const),
        new URL(request.url).searchParams.get("cursor"),
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
  const location = useLocation();
  return (
    <SearchList
      key={location.pathname + location.search}
      data={data}
      context={location.pathname + location.search}
    />
  );
}
function SearchList({
  data,
  context,
}: {
  data: Route.ComponentProps["loaderData"];
  context: string;
}) {
  const code = data.market.code;
  const endpoint = `/api/v1/search?country=${code}&q=${encodeURIComponent(data.query)}`;
  const foods = useBatches({
    context,
    section: "foods",
    initial: data.batches.foods,
    endpoint,
    identity: (item) => item.id,
  });
  const brands = useBatches({
    context,
    section: "brands",
    initial: data.batches.brands,
    endpoint,
    identity: (item) => item.id,
  });
  const products = useBatches({
    context,
    section: "products",
    initial: data.batches.products,
    endpoint,
    identity: (item) => item.id,
  });
  const found = foods.count + brands.count + products.count;
  const renderProducts = useCallback(
    (product: (typeof data.products)[number]) => (
      <li
        className="va-result"
        tabIndex={-1}
        data-result={product.id}
        key={product.id}
      >
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
    ),
    [code, data.market.name],
  );
  const renderBrands = useCallback(
    (brand: (typeof data.brands)[number]) => (
      <li
        className="va-result"
        tabIndex={-1}
        data-result={brand.id}
        key={brand.id}
      >
        <Link className="va-row-link" to={brandPath(code, brand.slug)}>
          <span className="va-row-link__text">
            <span className="va-row-link__title">{brand.name}</span>
            <span className="va-small va-muted">
              {plural(brand.productCount, "product")} in {data.market.name}
            </span>
          </span>
        </Link>
      </li>
    ),
    [code, data.market.name],
  );
  const renderFoods = useCallback(
    (food: (typeof data.foods)[number]) => (
      <li
        className="va-result"
        tabIndex={-1}
        data-result={food.id}
        key={food.id}
      >
        <FoodCard
          country={code}
          food={food}
          place={food.aisle ?? undefined}
          level={3}
        />
      </li>
    ),
    [code, data.market.name],
  );
  return (
    <PageShell search={false}>
      <header className="va-search-page__head">
        <h1 className="va-display-l">
          {data.query ? `Results for “${data.query}”` : "Search every food"}
        </h1>
        {data.query && (
          <p className="va-muted">
            {joinList([
              plural(foods.count, "food"),
              // Brands are named only when some match.
              ...(brands.count ? [plural(brands.count, "brand")] : []),
              plural(products.count, "product"),
            ])}{" "}
            shown in {data.market.name}
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
          {foods.count > 0 && (
            <section
              className="va-search-page__section"
              aria-labelledby="foods-title"
            >
              <h2 id="foods-title" className="va-heading-m">
                Foods
              </h2>
              <ul ref={foods.list} className="va-food-grid">
                {foods.batches.map((batch, index) => (
                  <BatchItems key={index} batch={batch} render={renderFoods} />
                ))}
              </ul>
              <SeeMore {...foods.control} />
            </section>
          )}
          {(brands.count > 0 || brands.control.limitReached) && (
            <section
              className="va-search-page__section"
              aria-labelledby="brands-title"
            >
              <h2 id="brands-title" className="va-heading-m">
                Brands
              </h2>
              <ul
                ref={brands.list}
                className="va-divided va-card va-search-page__products"
              >
                {brands.batches.map((batch, index) => (
                  <BatchItems key={index} batch={batch} render={renderBrands} />
                ))}
              </ul>
              <SeeMore {...brands.control} />
            </section>
          )}
          {products.count > 0 && (
            <section
              className="va-search-page__section"
              aria-labelledby="products-title"
            >
              <h2 id="products-title" className="va-heading-m">
                Products
              </h2>
              <ul
                ref={products.list}
                className="va-divided va-card va-search-page__products"
              >
                {products.batches.map((batch, index) => (
                  <BatchItems
                    key={index}
                    batch={batch}
                    render={renderProducts}
                  />
                ))}
              </ul>
              <SeeMore {...products.control} />
            </section>
          )}
          {!found && !brands.control.limitReached && (
            <EmptyState
              title={
                (data.query.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < 3
                  ? "Enter at least 3 letters or numbers"
                  : `No foods, brands or products match “${data.query}” yet`
              }
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
    <div className="va-category-directory">
      {groupCategories(aisles).map((group) => (
        <section
          key={group.id}
          id={group.id}
          className="va-category-directory__group"
          aria-labelledby={`${group.id}-title`}
        >
          <h2 id={`${group.id}-title`} className="va-heading-m">
            <FoodIcon slug={group.iconSlug} size={24} /> {group.name}
          </h2>
          <ul className="va-search-page__aisles">
            {group.categories.map((aisle) => (
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
                      <Link
                        className="va-row-link"
                        to={foodPath(country, food.slug)}
                      >
                        <span className="va-row-link__text">
                          <span className="va-row-link__title">
                            {food.name}
                          </span>
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
        </section>
      ))}
    </div>
  );
}
