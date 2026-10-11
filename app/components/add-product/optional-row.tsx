import { useEffect, useState, type ReactNode } from "react";

/**
 * One optional part of step 2: a disclosure in a divided list, with what has
 * been added so far. A row with content, or with a problem, opens.
 */
export function OptionalRow({
  title,
  status,
  open: wanted = false,
  children,
}: {
  title: string;
  status?: string;
  open?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(wanted);
  useEffect(() => {
    if (wanted) setOpen(true);
  }, [wanted]);
  return (
    <details
      className="va-optional"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="va-optional__summary">
        <span className="va-optional__title">{title}</span>
        <span className="va-optional__tag">Optional</span>
        {status && <span className="va-optional__status">{status}</span>}
      </summary>
      <div className="va-optional__body">{children}</div>
    </details>
  );
}
