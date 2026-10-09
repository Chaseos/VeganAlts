// Optional rating details (docs/RANKING.md, milestone 5). Detail scores
// explain a rating and "last ate the original" gives it context; neither
// changes its weight or the Top score.
export const CONVENTIONAL_RECENCY = [
  "current_or_week",
  "within_month",
  "within_year",
  "over_year",
  "prefer_not_to_say",
] as const;
export type ConventionalRecency = (typeof CONVENTIONAL_RECENCY)[number];
export const isConventionalRecency = (
  value: unknown,
): value is ConventionalRecency =>
  typeof value === "string" &&
  (CONVENTIONAL_RECENCY as readonly string[]).includes(value);

// Keys appear in sort URLs (`view=detail-<key>`) and never change.
export const DIMENSION_KEY = /^[a-z][a-z0-9_]{0,39}$/;
export const isDimensionKey = (value: unknown): value is string =>
  typeof value === "string" && DIMENSION_KEY.test(value);
export const MAX_DIMENSIONS = 8;

// Every new food asks these until an operator sets its own questions.
export const DEFAULT_DIMENSIONS = [
  { key: "taste", label: "Taste" },
  { key: "texture", label: "Texture" },
] as const;
