import { useState, type ReactNode } from "react";
import { Form, Link } from "react-router";
import type {
  CategorySummary,
  DiscoveryRow,
  ProductSummary,
  RankingRow,
  StoreOption,
} from "@server/catalog/domain/contracts";
import { StoreLine } from "./catalog/ranking-filters";
import {
  foodPath,
  productPath,
  searchPath,
  useCountryCode,
  useSiteChrome,
} from "../lib/site-chrome";
import { useFoodHref } from "../lib/ranking-filters";
import { PageShell } from "./layout/page-shell";

// Transitional wrapper: pages move to PageShell as they are redesigned.
export function SiteShell({
  children,
  compact = false,
  search = true,
}: {
  children: ReactNode;
  compact?: boolean;
  search?: boolean;
}) {
  return (
    <PageShell width={compact ? "narrow" : "wide"} search={search}>
      {children}
    </PageShell>
  );
}

export function SearchForm({
  query = "",
  large = false,
}: {
  query?: string;
  large?: boolean;
}) {
  const country = useCountryCode();
  return (
    <Form
      method="get"
      action={searchPath(country)}
      role="search"
      className={`search-form${large ? " large" : ""}`}
    >
      <label className="sr-only" htmlFor="catalog-search">
        What would you like to replace?
      </label>
      <span className="search-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <circle cx="10" cy="10" r="6.5" />
          <path d="m15 15 6 6" />
        </svg>
      </span>
      <input
        key={query}
        id="catalog-search"
        name="q"
        type="search"
        defaultValue={query}
        maxLength={80}
        placeholder="Try beef, cheese, or your favorite brand"
        autoComplete="off"
      />
      <button type="submit" className="button">
        Search <span aria-hidden="true">↗</span>
      </button>
    </Form>
  );
}

export function CategoryCards({
  categories,
}: {
  categories: CategorySummary[];
}) {
  return (
    <div className="category-grid">
      {categories.map((category, index) => (
        <CategoryCard key={category.id} category={category} index={index} />
      ))}
    </div>
  );
}

function CategoryCard({
  category,
  index,
}: {
  category: CategorySummary;
  index: number;
}) {
  const country = useCountryCode();
  // Rankings carry the visitor's saved stores and allergens once hydrated.
  const href = useFoodHref(country, foodPath(country, category.slug));
  return (
    <Link className="category-card" to={href}>
      <span className={`category-mark tone-${index % 3}`} aria-hidden="true">
        {category.name.charAt(0)}
      </span>
      <div>
        <h3>{category.name}</h3>
        <p>
          {category.productCount
            ? `${category.productCount} alternatives`
            : "Explore categories"}
        </p>
      </div>
      <span aria-hidden="true">↗</span>
    </Link>
  );
}

export function ProductImage({
  id,
  name,
  large = false,
}: {
  id: string | null;
  name: string;
  large?: boolean;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);
  return (
    <div className={`product-image${large ? " large" : ""}`}>
      {id && failedId !== id ? (
        <img
          key={id}
          src={`/media/${id}/${large ? "full" : "thumbnail"}`}
          alt={`${name} package`}
          width={large ? 720 : 100}
          height={large ? 720 : 100}
          loading={large ? "eager" : "lazy"}
          fetchPriority={large ? "high" : undefined}
          decoding="async"
          onError={() => setFailedId(id)}
        />
      ) : (
        <div
          className="image-placeholder"
          role="img"
          aria-label={`${name}: image not available`}
        >
          <svg
            width="40"
            height="48"
            viewBox="0 0 40 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M8 12h24v30H8zM12 5h16v7H12zM15 32c0-9 10-12 10-12s3 11-10 12Z" />
          </svg>
          <span>Image coming soon</span>
        </div>
      )}
    </div>
  );
}

export function Score({
  value,
  count,
}: {
  value: number | null;
  count: number;
}) {
  return (
    <div className="score-block">
      <strong className="score">
        {value === null || !count ? (
          "—"
        ) : (
          <>
            {value.toFixed(1)}
            <span>/5</span>
          </>
        )}
      </strong>
      <span className="rating-count">
        {count.toLocaleString("en-US")} {count === 1 ? "rating" : "ratings"}
      </span>
      {count > 0 && count < 10 && <span className="early-badge">Early</span>}
    </div>
  );
}

export function ProductRows({
  products,
  start,
  categoryId,
  unranked = false,
  stores = [],
}: {
  products: (ProductSummary | RankingRow | DiscoveryRow)[];
  start?: number;
  categoryId?: string;
  unranked?: boolean;
  stores?: StoreOption[];
}) {
  const { country } = useSiteChrome();
  return (
    <ol className="product-list" start={start}>
      {products.map((product, index) => {
        // Rows show their overall Top rank even when filters narrow the list.
        const rank =
          "topRank" in product
            ? product.topRank
            : start !== undefined
              ? start + index
              : null;
        const href = `${productPath(country.code, product.slug)}${categoryId ? `#rate-${categoryId}` : ""}`;
        return (
          <li key={product.id} className="product-row">
            {rank !== null && (
              <span className="rank-position" aria-label={`Rank ${rank}`}>
                {String(rank).padStart(2, "0")}
              </span>
            )}
            <Link to={href} className="product-link">
              <ProductImage id={product.imageId} name={product.name} />
              <div>
                <span className="product-brand">{product.brand}</span>
                <h3>{product.name}</h3>
                <NewProductBadge isNew={product.isNew} />
                <span className="product-meta">
                  {product.developmentOnly ? "Demo product · " : ""}
                  {country.name}
                </span>
                {"matchedStores" in product && (
                  <StoreLine slugs={product.matchedStores} stores={stores} />
                )}
              </div>
            </Link>
            {"bayesianScore" in product ? (
              <Score
                value={product.bayesianScore}
                count={product.ratingCount}
              />
            ) : unranked ? (
              <span className="unrated-label">Not yet rated</span>
            ) : null}
            <Link
              className="row-arrow"
              to={href}
              aria-label={`Explore ${product.name}`}
            >
              ↗
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

// The service decides newness; rendering never reads the clock, so a cached
// page hydrates with the same markup it was served with.
export function NewProductBadge({ isNew }: { isNew?: boolean }) {
  return isNew ? <span className="new-badge">New</span> : null;
}

export function RankingExplanation() {
  return (
    <details className="ranking-explanation">
      <summary>How rankings work</summary>
      <p>
        Scores reflect how closely an alternative resembles the original food.
        We adjust for the amount of feedback, starting with a baseline of 3.5/5
        and the weight of 10 ratings. More feedback gives the community’s
        experience more influence.
      </p>
      <p>
        “Early” means fewer than 10 ratings. Unrated products stay separate.
        Each category and formula has its own score. Rankings refresh
        periodically; saving your rating updates your personal state
        immediately. Brands and contributor reputation never increase a rating’s
        weight.
      </p>
    </details>
  );
}

export { EmptyState } from "./ui/feedback";
export { Pagination } from "./ui/navigation";
