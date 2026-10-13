import { Link } from "react-router";
import type { AllergenDeclaration } from "@server/community/domain/allergens";
import type { StoreOption } from "@server/catalog/domain/contracts";
import type { DetailScore } from "@server/catalog/domain/ranking-view";
import { FoodIcon } from "../icons/food-icons";
import { RankFlag, ScoreLabel } from "../ui/score";
import {
  AllergenLabel,
  Badge,
  EarlyBadge,
  NewBadge,
  SeasonalProductBadge,
  TrendingBadge,
} from "../ui/badges";
import { DetailBars, DetailCells } from "../ui/bars";
import { ButtonLink } from "../ui/button";
import { StoreLine } from "./ranking-filters";
import { formatScore, plural, shortDate } from "../../lib/format";
import { productPath } from "../../lib/site-chrome";

// One flavor of a recipe line, with its own score in the ranking shown.
export interface ListedFlavor {
  productId: string;
  slug: string;
  name: string;
  flavor: string | null;
  // The flavor, "Original", or the product name when several lack a flavor.
  label: string;
  ratingCount: number;
  // Shown from five answers.
  score: number | null;
  allergens: AllergenDeclaration | null;
  isNew: boolean;
  // Sold only part of the year.
  seasonal: boolean;
  matchesFilters: boolean;
}
// A recipe line in a food's list (milestone 7), shown by its lead flavor.
export interface ListedLine {
  lineId: string;
  name: string;
  brand: string | null;
  leadProduct: { id: string; slug: string; imageId: string | null };
  publishedAt: number | null;
  isNew?: boolean;
  flavorCount: number;
  closestRank: number | null;
  tastiestRank: number | null;
  // The ranking being viewed.
  score: number | null;
  people: number;
  early: boolean;
  recentPeople: number;
  trending: boolean;
  matchedStores: string[];
  // A single-flavor line's declaration; several flavors show theirs.
  allergens: AllergenDeclaration | null;
  details: DetailScore[];
  badges: string[];
  flavors: ListedFlavor[];
  hiddenFlavorCount: number;
  // Every listed flavor is seasonal.
  seasonal: boolean;
}
type Labels = Record<string, string>;

// The declaration in the country's wording, for AllergenLabel.
export function allergenSummary(
  declaration: AllergenDeclaration | null,
  labels: Labels,
) {
  if (!declaration) return null;
  const named = (keys: string[]) =>
    keys.map((key) => ({
      key,
      label: labels[key] ?? key.replaceAll("_", " "),
    }));
  return declaration.status === "none_declared"
    ? { status: "none_declared" as const, contains: [], mayContain: [] }
    : {
        status: "declared" as const,
        contains: named(declaration.contains),
        mayContain: named(declaration.mayContain),
      };
}

function Thumb({
  line,
  food,
  size,
}: {
  line: Pick<ListedLine, "leadProduct">;
  food: string;
  size: number;
}) {
  return line.leadProduct.imageId ? (
    <img
      className="va-thumb"
      src={`/media/${line.leadProduct.imageId}/thumbnail`}
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

const people = (count: number) => plural(count, "person", "people");
export const flavorLabel = (flavor: string | null) => flavor ?? "Original";

/**
 * A line's flavors behind a native disclosure, so it works without
 * JavaScript. Each flavor links to its own page with its score in the
 * ranking shown, or "Too few ratings yet".
 */
export function FlavorList({
  country,
  food,
  line,
  labels,
}: {
  country: string;
  food: string;
  line: Pick<
    ListedLine,
    "flavors" | "hiddenFlavorCount" | "flavorCount" | "name"
  >;
  labels: Labels;
}) {
  if (line.flavorCount < 2) return null;
  return (
    <details className="va-flavors">
      <summary>
        {plural(line.flavorCount, "flavor")}
        <span className="sr-only"> of {line.name}</span>
      </summary>
      <ul className="va-flavors__list">
        {line.flavors.map((flavor) => {
          const allergens = allergenSummary(flavor.allergens, labels);
          return (
            <li key={flavor.productId} className="va-flavors__item">
              <Link
                className="va-flavors__name"
                to={productPath(country, flavor.slug, food)}
              >
                {flavor.label}
                <span className="sr-only">: {flavor.name}</span>
              </Link>
              <span className="va-flavors__meta va-small va-muted">
                {flavor.isNew && <NewBadge />}
                {flavor.seasonal && line.flavorCount > 1 && (
                  <SeasonalProductBadge />
                )}
                {allergens && (
                  <AllergenLabel allergens={allergens} variant="line" />
                )}
              </span>
              <span className="va-flavors__score">
                {flavor.score !== null ? (
                  <>
                    <span className="sr-only">Score </span>
                    {formatScore(flavor.score)}
                  </>
                ) : (
                  <span className="va-small va-muted">Too few ratings yet</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {line.hiddenFlavorCount > 0 && (
        <p className="va-small va-muted va-flavors__hidden">
          {plural(line.hiddenFlavorCount, "more flavor")}{" "}
          {line.hiddenFlavorCount === 1 ? "doesn’t" : "don’t"} match your
          filters.
        </p>
      )}
    </details>
  );
}

function LineChips({
  line,
  labels,
  stores,
}: {
  line: ListedLine;
  labels: Labels;
  stores: StoreOption[];
}) {
  const allergens = allergenSummary(line.allergens, labels);
  return (
    <>
      {line.early && <EarlyBadge count={line.people} />}
      {line.isNew && <NewBadge />}
      {line.trending && <TrendingBadge />}
      {line.seasonal && <SeasonalProductBadge />}
      {line.badges.map((badge) => (
        <Badge key={badge} tone="good">
          {badge}
        </Badge>
      ))}
      {allergens && <AllergenLabel allergens={allergens} variant="line" />}
      <StoreLine slugs={line.matchedStores} stores={stores} />
    </>
  );
}

// The #1 line of the ranking shown (or, under filters, the closest match).
export function FeaturedSwap({
  country,
  food,
  line,
  rank,
  flag,
  labels,
  stores,
}: {
  country: string;
  food: string;
  line: ListedLine;
  // Its place in the ranking shown; a filter can feature a lower one.
  rank: number | null;
  flag: string;
  labels: Labels;
  stores: StoreOption[];
}) {
  const href = productPath(country, line.leadProduct.slug, food);
  const titleId = `featured-${line.lineId}`;
  return (
    <article className="va-featured" aria-labelledby={titleId}>
      <span className="va-featured__flag">
        <RankFlag>{flag}</RankFlag>
      </span>
      <Thumb line={line} food={food} size={160} />
      <div className="va-featured__body">
        <div className="va-featured__head">
          <div className="va-featured__title">
            <h2 id={titleId} className="va-featured__name">
              <Link to={href}>{line.name}</Link>
            </h2>
            <p className="va-muted">
              {[
                line.brand,
                people(line.people),
                rank && rank !== 1 ? `#${rank} overall` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="va-chip-row">
              <LineChips line={line} labels={labels} stores={stores} />
            </p>
          </div>
          {line.score !== null && (
            <ScoreLabel value={line.score} size="large" />
          )}
        </div>
        <DetailBars details={line.details} />
        <FlavorList country={country} food={food} line={line} labels={labels} />
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
  line,
  rank,
  note,
  activeDetail,
  labels,
  stores,
}: {
  country: string;
  food: string;
  line: ListedLine;
  // The line's place in the ranking shown, if it has one there.
  rank: number | null;
  // Sort context, such as "+12 people this quarter".
  note?: string | null;
  activeDetail: string | null;
  labels: Labels;
  stores: StoreOption[];
}) {
  const href = productPath(country, line.leadProduct.slug, food);
  const parts = (
    <>
      <span className="va-rank-row__rank">
        {rank ? (
          <>
            <span className="sr-only">Rank </span>#{rank}
          </>
        ) : (
          <span className="va-rank-row__unranked">
            {line.closestRank ? "–" : "New"}
          </span>
        )}
      </span>
      <Thumb line={line} food={food} size={60} />
      <span className="va-rank-row__main">
        <span className="va-rank-row__name">{line.name}</span>
        <span className="va-small va-muted">
          {[
            line.brand,
            // Rated lines with no answers yet only appear in Tastiest.
            line.people
              ? people(line.people)
              : line.closestRank
                ? "No one has said how tasty yet"
                : "No ratings yet",
            note,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="va-rank-row__meta">
          <LineChips line={line} labels={labels} stores={stores} />
        </span>
      </span>
      {line.details.length > 0 && (
        <DetailCells details={line.details} active={activeDetail} />
      )}
      {line.score !== null && rank !== null && (
        <ScoreLabel
          value={line.score}
          size="compact"
          className="va-rank-row__score"
        />
      )}
    </>
  );
  // One flavor: the whole row links to it. Several: the name links to the
  // lead flavor and a disclosure lists the rest, so no control nests in a
  // link.
  if (line.flavorCount < 2)
    return (
      <Link className="va-rank-row" to={href}>
        {parts}
      </Link>
    );
  return (
    <div className="va-rank-row va-rank-row--line">
      <Link className="va-rank-row__link" to={href}>
        {parts}
      </Link>
      <FlavorList country={country} food={food} line={line} labels={labels} />
    </div>
  );
}

export function UnratedRow({
  country,
  food,
  line,
  labels,
}: {
  country: string;
  food: string;
  line: Pick<
    ListedLine,
    | "lineId"
    | "name"
    | "brand"
    | "leadProduct"
    | "publishedAt"
    | "flavorCount"
    | "allergens"
    | "flavors"
    | "hiddenFlavorCount"
  >;
  labels: Labels;
}) {
  const allergens = allergenSummary(line.allergens, labels);
  const href = productPath(country, line.leadProduct.slug, food);
  return (
    <li className="va-unrated">
      <span className="va-unrated__main">
        <Link className="va-unrated__name" to={href}>
          {line.name}
        </Link>
        <span className="va-small va-muted">
          {[
            line.brand,
            line.publishedAt ? `added ${shortDate(line.publishedAt)}` : null,
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
        <FlavorList country={country} food={food} line={line} labels={labels} />
      </span>
      <ButtonLink variant="secondary" small to={`${href}#scores-title`}>
        Be the first to rate<span className="sr-only">: {line.name}</span>
      </ButtonLink>
    </li>
  );
}

export const sortNote = (view: string, line: ListedLine) =>
  view === "trending"
    ? line.recentPeople > 0
      ? `${people(line.recentPeople)} this week`
      : "rising this quarter"
    : view === "new" && line.publishedAt
      ? `added ${shortDate(line.publishedAt)}`
      : null;
