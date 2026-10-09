import { formatScore } from "../../lib/format";

// The content security policy forbids inline styles, so proportional fills are
// SVG presentation attributes (an integer percentage), colored by classes.
export function Bar({ percent }: { percent: number }) {
  const width = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
  return (
    <svg
      className="va-bar"
      width="100%"
      height="8"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="va-bar__track" width="100%" height="100%" rx="4" />
      {percent > 0 && (
        <rect className="va-bar__fill" width={width} height="100%" rx="4" />
      )}
    </svg>
  );
}

export interface DetailScore {
  key: string;
  label: string;
  // null until the dimension has enough answers to show a mean.
  mean: number | null;
  count: number;
}

export function DetailBars({
  details,
  label = "Detail scores",
}: {
  details: DetailScore[];
  label?: string;
}) {
  const shown = details.filter((d) => d.mean !== null);
  if (!shown.length) return null;
  return (
    <ul className="va-detail-bars" aria-label={label}>
      {shown.map((detail) => (
        <li key={detail.key}>
          <span className="va-detail-bars__label">{detail.label}</span>
          <Bar percent={((detail.mean ?? 0) / 5) * 100} />
          <strong>{formatScore(detail.mean ?? 0)}</strong>
        </li>
      ))}
    </ul>
  );
}

// Compact per-row cells. The active detail sort is highlighted.
export function DetailCells({
  details,
  active,
}: {
  details: DetailScore[];
  active?: string | null;
}) {
  if (!details.length) return null;
  return (
    <span className="va-detail-cells" role="group" aria-label="Detail scores">
      {details.map((detail) => (
        <span
          key={detail.key}
          className={`va-detail-cell${active === detail.key ? " va-detail-cell--active" : ""}`}
        >
          <span className="va-detail-cell__label">{detail.label}</span>
          <strong>
            {detail.mean === null ? (
              <>
                <span aria-hidden="true">—</span>
                <span className="sr-only">not enough answers yet</span>
              </>
            ) : (
              formatScore(detail.mean)
            )}
          </strong>
        </span>
      ))}
    </span>
  );
}

export function DistributionBars({
  rows,
  label,
}: {
  rows: { label: string; count: number }[];
  label: string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (!total) return null;
  return (
    <ul className="va-distribution" aria-label={label}>
      {rows.map((row) => {
        const percent = Math.round((row.count / total) * 100);
        return (
          <li key={row.label}>
            <span>{row.label}</span>
            <Bar percent={percent} />
            <strong>{percent}%</strong>
          </li>
        );
      })}
    </ul>
  );
}
