export const isRecordId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export const isSimilarityScore = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 1 &&
  value <= 5;
export function isRatingSelection(value: {
  productVersionId?: unknown;
  categoryId?: unknown;
  overallSimilarity?: unknown;
}) {
  return (
    isRecordId(value.productVersionId) &&
    isRecordId(value.categoryId) &&
    isSimilarityScore(value.overallSimilarity)
  );
}
