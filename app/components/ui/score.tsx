import { formatScore } from "../../lib/format";

export type ScoreSize = "large" | "medium" | "compact" | "mini";

// The yellow shelf label. It always reads as a score, never a price: large and
// medium sizes say "out of 5"; compact sizes append "/5".
export function ScoreLabel({
  value,
  size = "medium",
  tone = "tag",
  className,
}: {
  value: number;
  size?: ScoreSize;
  // "neutral" is for a non-leading score shown beside a #1 (runner-ups,
  // Still waiting), so only the closest match carries the yellow label.
  tone?: "tag" | "neutral";
  className?: string;
}) {
  const classes = [
    "va-score",
    `va-score--${size}`,
    tone === "neutral" ? "va-score--neutral" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const score = formatScore(value);
  return size === "large" || size === "medium" ? (
    <span className={classes}>
      <span className="va-score__value">{score}</span>
      <span className="va-score__unit">out of 5</span>
    </span>
  ) : (
    <span className={classes}>
      <span className="va-score__value">{score}</span>
      <span className="va-score__unit" aria-hidden="true">
        /5
      </span>
      <span className="sr-only"> out of 5</span>
    </span>
  );
}

export function RankFlag({
  children,
  size = "regular",
}: {
  children: React.ReactNode;
  size?: "regular" | "small";
}) {
  return (
    <span className={`va-flag${size === "small" ? " va-flag--small" : ""}`}>
      {children}
    </span>
  );
}
