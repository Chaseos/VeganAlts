import { useEffect, useRef } from "react";

/**
 * Problems that stop a step, listed together and linked to their fields. It
 * takes focus when it appears so keyboard and screen-reader users hear it.
 */
export function ErrorSummary({
  errors,
  fieldIds,
  attempt,
}: {
  errors: Record<string, string | undefined>;
  fieldIds: Record<string, string>;
  // Changes on every Continue or Submit, so a repeat attempt refocuses.
  attempt: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  useEffect(() => {
    if (attempt && entries.length) ref.current?.focus();
    // Only a new attempt moves focus, never typing that fixes a field.
  }, [attempt]);
  if (!entries.length) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      className="va-error-summary"
      aria-labelledby="error-summary-title"
    >
      <p id="error-summary-title" className="va-error-summary__title">
        {entries.length === 1
          ? "One thing to fix"
          : `${entries.length} things to fix`}
      </p>
      <ul>
        {entries.map(([field, message]) => (
          <li key={field}>
            <a href={`#${fieldIds[field] ?? field}`}>{message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
