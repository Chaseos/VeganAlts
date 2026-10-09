import type { ReactNode } from "react";
import { useDisclosure } from "../../lib/use-disclosure";

// A disclosure popover: absolutely positioned under its summary on desktop and
// inline on phones (see components/popover.css).
export function Popover({
  summary,
  summaryLabel,
  className,
  panelLabel,
  align = "start",
  tone = "page",
  children,
}: {
  summary: ReactNode;
  // Accessible name when the visible summary is abbreviated.
  summaryLabel?: string;
  className?: string;
  panelLabel?: string;
  align?: "start" | "end";
  tone?: "page" | "kale";
  children: (close: (returnFocus?: boolean) => void) => ReactNode;
}) {
  const { ref, close } = useDisclosure();
  return (
    <details
      ref={ref}
      className={`va-popover va-popover--${align} va-popover--${tone}${className ? ` ${className}` : ""}`}
    >
      <summary aria-label={summaryLabel}>{summary}</summary>
      <div className="va-popover__panel" role="group" aria-label={panelLabel}>
        {children(close)}
      </div>
    </details>
  );
}
