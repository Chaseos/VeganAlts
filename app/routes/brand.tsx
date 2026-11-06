import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { publicCatalogService } from "@server/catalog/infrastructure/composition";
import { flavorLabel } from "@server/catalog/domain/flavor-label";
import { isEarly } from "@server/ranking/domain/display";
import {
  publicLoader,
  requireCatalogPreview,
  pageLanguage,
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
import { counted } from "../lib/counted";
import { productName } from "../lib/format";
import { t } from "../i18n";
import { publicMetadata, countryAlternates } from "../lib/metadata";
import type { Route } from "./+types/brand";

export async function loader({ params, request }: Route.LoaderArgs) {
  requireCatalogPreview(env);
  const catalog = publicCatalogService(env, pageLanguage(request));
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
  const name = data?.brand.name ?? t("brand.fallback");
  const country = data?.market.name ?? "";
  return [
    ...publicMetadata(
      t("brand.metaTitle", { name, country }),
      t("brand.metaDescription", { name, country }),
      brandPath(data?.market.code ?? "us", data?.brand.slug ?? ""),
      data?.origin ?? "https://veganalts.com",
      data?.staging ?? true,
    ),
    ...(data
      ? countryAlternates(data.origin, [data.market], (code, language) =>
          brandPath(code, data.brand.slug, language),
        )
      : []),
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
          { label: t("nav.allFoods"), to: homePath(code) },
          { label: data.brand.name },
        ]}
      />
      <header className="va-brand__head">
        <h1 className="va-display-l">{data.brand.name}</h1>
        <p className="va-muted">
          {counted("search.brandProducts", data.productCount, {
            country: data.market.name,
          })}
        </p>
      </header>
      {!data.availability.here ? (
        <EmptyState
          title={t("brand.noProducts", {
            name: data.brand.name,
            country: data.market.name,
          })}
          actions={<ButtonLink to={addHref}>{t("menu.addProduct")}</ButtonLink>}
        >
          {t("brand.foundOne")}
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
                          aria-label={t("ranking.view", {
                            name: productName(line.name, data.brand.name),
                          })}
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
                                ? t("brand.across", {
                                    count: line.rankedFlavorCount,
                                  })
                                : line.flavors.length === 1
                                  ? t("brand.thisFlavor")
                                  : t("brand.oneRanked")}
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
                              kind: "closest",
                              label: t("brand.closest"),
                              rank: line.closestRank,
                              score: line.closestScore,
                              people: line.people,
                            },
                            {
                              kind: "tastiest",
                              label: t("brand.tastiest"),
                              rank: line.tastiestRank,
                              score: line.tastiestScore,
                              people: line.tastiestPeople,
                            },
                          ].map((score) => (
                            <div className="va-brand__score" key={score.kind}>
                              <strong>
                                {score.label}
                                {score.rank !== null ? ` #${score.rank}` : ""}
                              </strong>
                              {score.rank !== null && score.score !== null ? (
                                <ScoreLabel
                                  value={score.score}
                                  size="compact"
                                  tone={
                                    score.kind === "tastiest"
                                      ? "tasty"
                                      : score.rank === 1
                                        ? "tag"
                                        : "neutral"
                                  }
                                />
                              ) : (
                                <span className="va-small va-muted">
                                  {t("brand.notRated")}
                                </span>
                              )}
                              <span className="va-small va-muted">
                                {counted("count.person", score.people)}
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
              {t("brand.addFrom", { name: data.brand.name })}
            </ButtonLink>
          </p>
        </div>
      )}
    </PageShell>
  );
}
