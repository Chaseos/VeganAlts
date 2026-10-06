import { useEffect, useState, type ReactNode } from "react";
import { Form, Link, useLocation } from "react-router";
import type {
  CategorySummary,
  ProductSummary,
  RankingRow,
} from "@server/catalog/domain/contracts";
import { usePersonalState } from "./personal-state";
import { PendingRatingRecovery } from "./pending-rating-recovery";

export function SiteShell({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  const { user } = usePersonalState();
  const location = useLocation();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  // Cached HTML cannot know the visitor's fragment or discarded query params.
  // Keep the first client render identical, then attach the full return URL.
  const signInTo = hydrated
    ? `/sign-in?returnTo=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`
    : "/sign-in";
  return (
    <div className="site-shell">
      <aside className="demo-banner" aria-label="Development preview">
        Development preview · Demo catalog & sample ratings
      </aside>
      <header className="app-header">
        <Link className="wordmark" to="/" aria-label="VeganAlts home">
          VeganAlts<span aria-hidden="true">.</span>
        </Link>
        <span className="country-label">United States</span>
        <nav aria-label="Main navigation">
          <Link to="/us/search">Discover</Link>
          <Link to="/my-ratings">My Ratings</Link>
          {user ? (
            <Link to="/account">Account</Link>
          ) : location.pathname === "/sign-in" ? (
            <span aria-current="page">Sign in</span>
          ) : (
            <Link to={signInTo}>Sign in</Link>
          )}
        </nav>
      </header>
      <main id="main" className={compact ? "content narrow" : "content"}>
        <PendingRatingRecovery />
        {children}
      </main>
      <footer className="app-footer">
        <Link className="wordmark" to="/">
          VeganAlts.
        </Link>
        <p>Closer to the foods you love.</p>
        <span>United States · Independent rankings</span>
      </footer>
    </div>
  );
}

export function SearchForm({
  query = "",
  large = false,
}: {
  query?: string;
  large?: boolean;
}) {
  return (
    <Form
      method="get"
      action="/us/search"
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
        <Link
          className="category-card"
          to={`/us/${category.slug}`}
          key={category.id}
        >
          <span
            className={`category-mark tone-${index % 3}`}
            aria-hidden="true"
          >
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
      ))}
    </div>
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
}: {
  products: (ProductSummary | RankingRow)[];
  start?: number;
  categoryId?: string;
  unranked?: boolean;
}) {
  return (
    <ol className="product-list" start={start}>
      {products.map((product, index) => (
        <li key={product.id} className="product-row">
          {start !== undefined && (
            <span
              className="rank-position"
              aria-label={`Rank ${start + index}`}
            >
              {String(start + index).padStart(2, "0")}
            </span>
          )}
          <Link
            to={`/us/products/${product.slug}${categoryId ? `#rate-${categoryId}` : ""}`}
            className="product-link"
          >
            <ProductImage id={product.imageId} name={product.name} />
            <div>
              <span className="product-brand">{product.brand}</span>
              <h3>{product.name}</h3>
              <span className="product-meta">
                {product.developmentOnly ? "Demo product · " : ""}United States
              </span>
            </div>
          </Link>
          {"bayesianScore" in product ? (
            <Score value={product.bayesianScore} count={product.ratingCount} />
          ) : unranked ? (
            <span className="unrated-label">Not yet rated</span>
          ) : null}
          <Link
            className="row-arrow"
            to={`/us/products/${product.slug}${categoryId ? `#rate-${categoryId}` : ""}`}
            aria-label={`Explore ${product.name}`}
          >
            ↗
          </Link>
        </li>
      ))}
    </ol>
  );
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

export function Pagination({
  page,
  hasNext,
  parameter = "page",
  label = "Rankings",
}: {
  page: number;
  hasNext: boolean;
  parameter?: string;
  label?: string;
}) {
  const location = useLocation();
  const destination = (number: number) => {
    const params = new URLSearchParams(location.search);
    if (number === 1) params.delete(parameter);
    else params.set(parameter, String(number));
    return `${location.pathname}${params.size ? `?${params}` : ""}`;
  };
  if (page === 1 && !hasNext) return null;
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      {page > 1 && (
        <Link to={destination(page - 1)} rel="prev">
          ← Previous
        </Link>
      )}
      <span>Page {page}</span>
      {hasNext && page < 100 && (
        <Link to={destination(page + 1)} rel="next">
          Next →
        </Link>
      )}
    </nav>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
