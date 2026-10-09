import type { ReactNode } from "react";

export function Notice({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: "info" | "warn" | "error" | "success";
  title?: string;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div className={`notice${tone === "info" ? "" : ` ${tone}`}`} role={role}>
      {title && <strong className="notice-title">{title}</strong>}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  actions,
  headingLevel = 2,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="va-empty">
      <Heading className="va-heading-s">{title}</Heading>
      {children && <p className="va-muted">{children}</p>}
      {actions && <div className="button-row">{actions}</div>}
    </div>
  );
}
