import { Link } from "react-router";
import type { AllergenDeclaration } from "@server/community/domain/allergens";
import type { StoreOption } from "@server/catalog/domain/contracts";
import type { DetailScore } from "@server/catalog/domain/ranking-view";
import { FoodIcon } from "../icons/food-icons";
import { RankFlag, ScoreLabel } from "../ui/score";
import { AllergenLabel, Badge, EarlyBadge, NewBadge } from "../ui/badges";
import { DetailBars, DetailCells } from "../ui/bars";
import { ButtonLink } from "../ui/button";
import { StoreLine } from "./ranking-filters";
import { formatCount, plural, shortDate } from "../../lib/format";
import { productPath } from "../../lib/site-chrome";

export interface ListedProduct {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  imageId: string | null;
  publishedAt: number | null;
  topRank: number | null;
  bayesianScore: number | null;
  ratingCount: number;
  recentRatingCount: number;
  early: boolean;
  isNew?: boolean;
  matchedStores: string[];
  allergens: AllergenDeclaration | null;
  details: DetailScore[];
  badges: string[];
}
type Labels = Record<string, string>;

// The declaration in the country's wording, for AllergenLabel.
export function allergenSummary(
  declaration: AllergenDeclaration | null,
  labels: Labels,
) {
  if (!declaration) return null;
  const named = (keys: string[]) =>
    keys.map((key) => ({ key, label: labels[key] ?? key.replaceAll("_", " ") }));
  return declaration.status === "none_declared"
    ? { status: "none_declared" as const, contains: [], mayContain: [] }
    : {
        status: "declared" as const,
        contains: named(declaration.contains),
        mayContain: named(declaration.mayContain),
      };
}

function Thumb({
  product,
  food,
  size,
}: {
  product: ListedProduct;
  food: string;
  size: number;
}) {
  return product.imageId ? (
    <img
      className="va-thumb"
      src={`/media/${product.imageId}/thumbnail`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
    />
  ) : (
    <span className="va-thumb va-thumb--empty" aria-hidden="true">
      <FoodIcon slug={food} size={Math.round(size / 2.4)} />
    </span>
  );
}

const ratings = (count: number) =>
  `${formatCount(count)} ${count === 1 ? "rating" : "ratings"}`;

// The #1 swap (or, under filters, the closest match among them).
export function FeaturedSwap({
  country,
  food,
  product,
  flag,
  labels,
  stores,
}: {
  country: string;
  food: string;
  product: ListedProduct;
  flag: string;
  labels: Labels;
  stores: StoreOption[];
}) {
  const href = productPath(country, product.slug);
  return (
    <article className="va-featured" aria-labelledby={`featured-${product.id}`}>
      <span className="va-featured__flag">
        <RankFlag>{flag}</RankFlag>
      </span>
      <Thumb product={product} food={food} size={160} />
      <div className="va-featured__body">
        <div className="va-featured__head">
          <div className="va-featured__title">
            <h2 id={`featured-${product.id}`} className="va-featured__name">
              <Link to={href}>{product.name}</Link>
            </h2>
            <p className="va-muted">
              {[
                product.brand,
                ratings(product.ratingCount),
                product.topRank && product.topRank !== 1
                  ? `#${product.topRank} overall`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="va-chip-row">
              {product.early && <EarlyBadge count={product.ratingCount} />}
              {product.isNew && <NewBadge />}
              <AllergenLabel
                allergens={allergenSummary(product.allergens, labels)}
              />
              <StoreLine slugs={product.matchedStores} stores={stores} />
            </p>
          </div>
          {product.bayesianScore !== null && (
            <ScoreLabel value={product.bayesianScore} size="large" />
          )}
        </div>
        <DetailBars details={product.details} />
        <div className="button-row">
          <ButtonLink to={href}>View product</ButtonLink>
          <ButtonLink variant="secondary" to={`${href}#scores-title`}>
            I’ve tried it
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}

export function RankedRow({
  country,
  food,
  product,
  note,
  activeDetail,
  labels,
  stores,
}: {
  country: string;
  food: string;
  product: ListedProduct;
  // Sort context, such as "+12 ratings this week".
  note?: string | null;
  activeDetail: string | null;
  labels: Labels;
  stores: StoreOption[];
}) {
  const allergens = allergenSummary(product.allergens, labels);
  return (
    <Link className="va-rank-row" to={productPath(country, product.slug)}>
      <span className="va-rank-row__rank">
        {product.topRank ? (
          <>
            <span className="sr-only">Rank </span>#{product.topRank}
          </>
        ) : (
          <span className="va-rank-row__unranked">New</span>
        )}
      </span>
      <Thumb product={product} food={food} size={60} />
      <span className="va-rank-row__main">
        <span className="va-rank-row__name">{product.name}</span>
        <span className="va-small va-muted">
          {[
            product.brand,
            product.ratingCount ? ratings(product.ratingCount) : "No ratings yet",
            note,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="va-rank-row__meta">
          {product.early && <EarlyBadge count={product.ratingCount} />}
          {product.isNew && <NewBadge />}
          {product.badges.map((badge) => (
            <Badge key={badge} tone="good">
              {badge}
            </Badge>
          ))}
          {allergens && <AllergenLabel allergens={allergens} variant="line" />}
          <StoreLine slugs={product.matchedStores} stores={stores} />
        </span>
      </span>
      {product.details.length > 0 && (
        <DetailCells details={product.details} active={activeDetail} />
      )}
      {product.bayesianScore !== null && product.topRank !== null && (
        <ScoreLabel
          value={product.bayesianScore}
          size="compact"
          className="va-rank-row__score"
        />
      )}
    </Link>
  );
}

export function UnratedRow({
  country,
  product,
  labels,
}: {
  country: string;
  product: ListedProduct | (Omit<ListedProduct, "details" | "badges"> & {
    details?: undefined;
  });
  labels: Labels;
}) {
  const allergens = allergenSummary(product.allergens, labels);
  return (
    <li className="va-unrated">
      <span className="va-unrated__main">
        <Link
          className="va-unrated__name"
          to={productPath(country, product.slug)}
        >
          {product.name}
        </Link>
        <span className="va-small va-muted">
          {[
            product.brand,
            product.publishedAt ? `added ${shortDate(product.publishedAt)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {allergens && (
            <>
              {" · "}
              <AllergenLabel allergens={allergens} variant="line" />
            </>
          )}
        </span>
      </span>
      <ButtonLink
        variant="secondary"
        small
        to={`${productPath(country, product.slug)}#scores-title`}
      >
        Be the first to rate<span className="sr-only">: {product.name}</span>
      </ButtonLink>
    </li>
  );
}

export const sortNote = (view: string, product: ListedProduct) =>
  view === "trending"
    ? product.recentRatingCount > 0
      ? `+${plural(product.recentRatingCount, "rating")} this week`
      : "rising this week"
    : view === "new" && product.publishedAt
      ? `added ${shortDate(product.publishedAt)}`
      : null;
