import { Link } from "react-router";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { useHydrated } from "../../lib/use-hydrated";
import type { AllergenDeclaration } from "@server/community/domain/allergens";
import type { StoreOption } from "@server/catalog/domain/contracts";
import type { DetailScore } from "@server/catalog/domain/ranking-view";
import { ProductThumbnail } from "./product-thumbnail";
import { RankFlag, ScoreLabel } from "../ui/score";
import {
  AllergenLabel,
  Badge,
  EarlyBadge,
  NewBadge,
  SeasonalBadge,
  TrendingBadge,
} from "../ui/badges";
import { DetailBars, DetailCells } from "../ui/bars";
import { ButtonLink } from "../ui/button";
import { StoreLine } from "./ranking-filters";
import { formatScore, plural, shortDate, productName } from "../../lib/format";
import { productPath } from "../../lib/site-chrome";

// One flavor of a recipe line, with its own score in the ranking shown.
export interface ListedFlavor {
  imageId: string | null;
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

const people = (count: number) => plural(count, "person", "people");
export const flavorLabel = (flavor: string | null) => flavor ?? "Original";

/**
 * A line's flavors behind a native disclosure, so it works without
 * JavaScript. Each flavor links to its own page with its score in the
 * ranking shown, or its rating count before the score is available.
 */
interface FlavorListProps {
  country: string;
  food: string;
  line: Pick<
    ListedLine,
    "flavors" | "hiddenFlavorCount" | "flavorCount" | "name"
  >;
  labels: Labels;
  id?: string;
}
export function FlavorList(props: FlavorListProps) {
  return props.line.flavorCount < 2 ? null : <ExpandableFlavors {...props} />;
}
function ExpandableFlavors({
  country,
  food,
  line,
  labels,
  id,
}: FlavorListProps) {
  const hydrated = useHydrated();
  const disclosure = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    setExpanded(disclosure.current?.open ?? false);
  }, []);
  return (
    <details
      ref={disclosure}
      className="va-flavors"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary>
        {plural(line.flavorCount, "flavor")}
        <span className="sr-only"> of {line.name}</span>
      </summary>
      {/* A fragment inside the disclosure reveals it even before hydration. */}
      <ul
        className="va-flavors__list"
        id={id}
        aria-hidden={hydrated && !expanded ? true : undefined}
      >
        {line.flavors.map((flavor) => {
          const allergens = allergenSummary(flavor.allergens, labels);
          return (
            <li key={flavor.productId} className="va-flavors__item">
              <Link
                className="va-flavors__photo"
                to={productPath(country, flavor.slug, food)}
                aria-label={`View ${flavor.label}: ${flavor.name}`}
              >
                <ProductThumbnail imageId={flavor.imageId} food={food} />
              </Link>
              <div className="va-flavors__body">
                <div className="va-flavors__heading">
                  {flavor.isNew && <NewBadge />}
                  {flavor.seasonal && <SeasonalBadge />}
                  <Link
                    className="va-flavors__name"
                    to={productPath(country, flavor.slug, food)}
                  >
                    {flavor.label}
                    <span className="sr-only">: {flavor.name}</span>
                  </Link>
                </div>
                {allergens && (
                  <div className="va-flavors__meta va-small va-muted">
                    <AllergenLabel allergens={allergens} variant="line" />
                  </div>
                )}
              </div>
              <div className="va-flavors__actions">
                <span className="va-flavors__score">
                  {flavor.score !== null ? (
                    <>
                      <span className="sr-only">Score </span>
                      {formatScore(flavor.score)}
                    </>
                  ) : (
                    <span className="va-small va-muted">
                      {flavor.ratingCount === 0
                        ? "No ratings"
                        : plural(flavor.ratingCount, "rating")}
                    </span>
                  )}
                </span>
                <Link
                  className="va-link va-flavors__rate"
                  to={`${productPath(country, flavor.slug, food)}#scores-title`}
                  aria-label={`Rate it: ${flavor.name}${flavor.flavor ? ` · ${flavor.flavor}` : ""}`}
                >
                  Rate it
                </Link>
              </div>
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

/** With several flavors, keep the choice here instead of choosing the lead. */
function openFlavors(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const disclosure = document.getElementById(id)?.closest("details");
  if (!(disclosure instanceof HTMLDetailsElement)) return;
  event.preventDefault();
  disclosure.open = true;
  disclosure.querySelector("summary")?.focus();
  disclosure.scrollIntoView({ block: "nearest" });
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
      {line.seasonal && <SeasonalBadge />}
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
  const flavorsId = useId();
  return (
    <article className="va-featured" aria-labelledby={titleId}>
      <span className="va-featured__flag">
        <RankFlag>{flag}</RankFlag>
      </span>
      <ProductThumbnail
        imageId={line.leadProduct.imageId}
        food={food}
        size="featured"
      />
      <div className="va-featured__body">
        <div className="va-featured__head">
          <div className="va-featured__title">
            <h2 id={titleId} className="va-featured__name">
              <Link to={href}>{productName(line.name, line.brand)}</Link>
            </h2>
            <p className="va-muted">
              {[
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
        <div className="button-row">
          <ButtonLink to={href}>View product</ButtonLink>
          {line.flavorCount > 1 ? (
            <a
              className="button secondary"
              href={`#${flavorsId}`}
              onClick={(event) => openFlavors(event, flavorsId)}
            >
              I’ve tried it
            </a>
          ) : (
            <ButtonLink variant="secondary" to={`${href}#scores-title`}>
              I’ve tried it
            </ButtonLink>
          )}
        </div>
      </div>
      <FlavorList
        id={flavorsId}
        country={country}
        food={food}
        line={line}
        labels={labels}
      />
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
          // Unranked here: "New" only for a line that is new, since a line
          // can trend on tries alone without being new.
          <span className="va-rank-row__unranked">
            {line.isNew && !line.closestRank ? "New" : "–"}
          </span>
        )}
      </span>
      <ProductThumbnail imageId={line.leadProduct.imageId} food={food} />
      <span className="va-rank-row__main">
        <span className="va-rank-row__name">
          {productName(line.name, line.brand)}
        </span>
        <span className="va-small va-muted">
          {[
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
    <li
      className="va-unrated va-result"
      data-result={line.lineId}
      tabIndex={-1}
    >
      <Link
        className="va-unrated__photo"
        to={href}
        aria-label={`View ${productName(line.name, line.brand)}`}
      >
        <ProductThumbnail imageId={line.leadProduct.imageId} food={food} />
      </Link>
      <span className="va-unrated__main">
        <Link className="va-unrated__name" to={href}>
          {productName(line.name, line.brand)}
        </Link>
        <span className="va-small va-muted">
          {line.publishedAt && `added ${shortDate(line.publishedAt)}`}
          {allergens && (
            <>
              {" · "}
              <AllergenLabel allergens={allergens} variant="line" />
            </>
          )}
        </span>
      </span>
      {line.flavorCount < 2 && (
        <a
          className="button secondary small-button"
          href={`${href}#scores-title`}
        >
          Be the first to rate
          <span className="sr-only">
            : {productName(line.name, line.brand)}
          </span>
        </a>
      )}
      <FlavorList country={country} food={food} line={line} labels={labels} />
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
