export interface IngredientEvidenceRow {
  evidenceUrls: string;
  packageIngredients: string | null;
  verification: string | null;
  acceptedSourcePhotos: number;
  onlineIngredients: string | null;
  onlineUrl: string | null;
  onlineAccessedAt: string | null;
  onlineProductMatch: string | null;
}

function webSource(value: unknown) {
  if (typeof value !== "string" || value.trim() !== value) return false;
  try {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Evidence for this formula, not merely a photo or URL somewhere on the product. */
export function hasIngredientEvidence(row: IngredientEvidenceRow) {
  let urls: unknown;
  try {
    urls = JSON.parse(row.evidenceUrls);
  } catch {
    urls = [];
  }
  if (Array.isArray(urls) && urls.some(webSource)) return true;
  if (
    ![
      "online_only",
      "single_read",
      "agreed",
      "corrected",
      "unresolved",
    ].includes(row.verification ?? "")
  )
    return false;
  if (
    ["single_read", "agreed", "corrected"].includes(row.verification ?? "") &&
    row.packageIngredients?.trim() &&
    row.acceptedSourcePhotos > 0
  )
    return true;
  return !!(
    row.verification &&
    row.onlineIngredients?.trim() &&
    row.onlineProductMatch?.trim() &&
    row.onlineAccessedAt &&
    Number.isFinite(Date.parse(row.onlineAccessedAt)) &&
    webSource(row.onlineUrl)
  );
}
