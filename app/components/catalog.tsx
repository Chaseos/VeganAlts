import { useState, type ReactNode } from "react";
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
