import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { flavorLabel } from "@server/catalog/domain/flavor-label";
import { isEarly } from "@server/ranking/domain/display";
import {
  publicLoader,
  requireCatalogPreview,
} from "@server/catalog/http/loader";
import {
  brandPath,
  foodPath,
  homePath,
  productPath,
} from "@server/catalog/domain/markets";
import { PageShell } from "../components/layout/page-shell";
import { Breadcrumb } from "../components/ui/navigation";
import { EmptyState } from "../components/ui/feedback";
import { ButtonLink } from "../components/ui/button";
import { ScoreLabel } from "../components/ui/score";
import { EarlyBadge } from "../components/ui/badges";
import { FoodIcon } from "../components/icons/food-icons";
import { ProductThumbnail } from "../components/catalog/product-thumbnail";
import { plural, productName } from "../lib/format";
import { publicMetadata } from "../lib/metadata";
import type { Route } from "./+types/brand";

export async function loader({ params }: Route.LoaderArgs) {
  requireCatalogPreview(env);
  const catalog = catalogService(env);
  return publicLoader(async () => {
    const market = await catalog.market(params.country);
    return {
      market,
      ...(await catalog.brand(market, params.brandSlug)),
      origin: env.APP_URL,
      staging: env.APP_ENV !== "production",
    };
  });
}

// A brand belongs to no one country; switching keeps its page.
export const handle = {
  countrySwitch: (data: unknown, code: string) => {
    const slug = (data as { brand?: { slug: string } } | undefined)?.brand
      ?.slug;
    return slug ? brandPath(code, slug) : null;
  },
};

export function meta({ loaderData: data }: Route.MetaArgs) {
  const name = data?.brand.name ?? "Brand";
  const country = data?.market.name ?? "";
  return [
    ...publicMetadata(
      `${name} vegan products in ${country}`,
      `Every ${name} vegan product in ${country}, by food, with where each recipe ranks.`,
      brandPath(data?.market.code ?? "us", data?.brand.slug ?? ""),
      data?.origin ?? "https://veganalts.com",
      data?.staging ?? true,
    ),
    // A brand with nothing listed here keeps its page but isn't indexed.
    ...(data && !data.availability.here && !data.staging
      ? [{ name: "robots", content: "noindex" }]
      : []),
  ];
}

// A brand's page (milestone 7): its recipe lines by aisle and food, each
// with its Closest and Tastiest ranks there and its flavors.
export default function Brand({ loaderData: data }: Route.ComponentProps) {
  const code = data.market.code;
  const addHref = `/add-product?country=${code}&brand=${data.brand.slug}`;
  return (
    <PageShell width="wide">
      <Breadcrumb
        items={[
          { label: "All foods", to: homePath(code) },
          { label: data.brand.name },
        ]}
      />
      <header className="va-brand__head">
        <h1 className="va-display-l">{data.brand.name}</h1>
        <p className="va-muted">
          {plural(data.productCount, "product")} in {data.market.name}
        </p>
      </header>
      {!data.availability.here ? (
        <EmptyState
          title={`No ${data.brand.name} products in ${data.market.name} yet`}
          actions={<ButtonLink to={addHref}>Add a product</ButtonLink>}
        >
          Found one here? Add it and it joins the rankings.
        </EmptyState>
      ) : (
        <div className="va-brand">
          {data.aisles.map((aisle) => (
            <section
              key={aisle.slug}
              className="va-brand__aisle"
              aria-labelledby={`aisle-${aisle.slug}`}
            >
              <h2 id={`aisle-${aisle.slug}`} className="va-heading-m">
                <FoodIcon slug={aisle.slug} size={22} /> {aisle.name}
              </h2>
              {aisle.foods.map((food) => (
                <div key={food.slug} className="va-card va-brand__food">
                  <h3 className="va-heading-s">
                    <Link className="va-link" to={foodPath(code, food.slug)}>
                      {food.name}
                    </Link>
                  </h3>
                  <ul className="va-divided">
                    {food.lines.map((line) => (
                      <li key={line.lineId} className="va-brand__line">
                        <Link
                          to={productPath(
                            code,
                            line.leadProduct.slug,
                            food.slug,
                          )}
                          aria-label={`View ${productName(line.name, data.brand.name)}`}
                        >
                          <ProductThumbnail
                            imageId={line.leadProduct.imageId}
                            food={food.slug}
                          />
                        </Link>
                        <span className="va-row-link__text">
                          <span className="va-row-link__title">
                            <Link
                              to={productPath(
                                code,
                                line.leadProduct.slug,
                                food.slug,
                              )}
                            >
                              {productName(line.name, data.brand.name)}
                            </Link>
                          </span>
                          {line.closestRank !== null && (
                            <span className="va-small va-muted">
                              {line.rankedFlavorCount > 1
                                ? `Across ${line.rankedFlavorCount} flavors`
                                : line.flavors.length === 1
                                  ? "This flavor"
                                  : "1 ranked flavor"}
                            </span>
                          )}
                          <span className="va-brand__flavors">
                            {line.flavors.map((flavor, index) => (
                              <span key={flavor.id}>
                                {index > 0 && " · "}
                                <Link
                                  className="va-link"
                                  to={productPath(code, flavor.slug, food.slug)}
                                >
                                  {flavorLabel(flavor, line.flavors)}
                                </Link>
                              </span>
                            ))}
                          </span>
                        </span>
                        <div className="va-brand__scores">
                          {[
                            {
                              label: "Closest",
                              rank: line.closestRank,
                              score: line.closestScore,
                              people: line.people,
                            },
                            {
                              label: "Tastiest",
                              rank: line.tastiestRank,
                              score: line.tastiestScore,
                              people: line.tastiestPeople,
                            },
                          ].map((score) => (
                            <div className="va-brand__score" key={score.label}>
                              <strong>
                                {score.label}
                                {score.rank !== null ? ` #${score.rank}` : ""}
                              </strong>
                              {score.rank !== null && score.score !== null ? (
                                <ScoreLabel
                                  value={score.score}
                                  size="compact"
                                  tone={
                                    score.label === "Tastiest"
                                      ? "tasty"
                                      : score.rank === 1
                                        ? "tag"
                                        : "neutral"
                                  }
                                />
                              ) : (
                                <span className="va-small va-muted">
                                  Not rated yet
                                </span>
                              )}
                              <span className="va-small va-muted">
                                {plural(score.people, "person", "people")}
                              </span>
                              {isEarly(score.people) && (
                                <EarlyBadge count={score.people} />
                              )}
                            </div>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
          <p>
            <ButtonLink variant="secondary" to={addHref}>
              Add a product from {data.brand.name}
            </ButtonLink>
          </p>
        </div>
      )}
    </PageShell>
  );
}
