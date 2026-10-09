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
