// A flavor's name in its line (milestone 7), the same on food, product and
// brand pages and in Add a product: its flavor, else "Original" for the
// line's one unlabeled flavor, else its product name when several have none.
export function flavorLabel(
  flavor: { flavor: string | null; name: string },
  line: readonly { flavor: string | null }[],
) {
  return (
    flavor.flavor ??
    (line.filter((f) => f.flavor === null).length > 1
      ? flavor.name
      : "Original")
  );
}

/** A line's original: no flavor of its own, or labeled Original. */
export const isOriginalFlavor = (flavor: string | null) =>
  flavor === null || flavor.trim().toLowerCase() === "original";

/** SQL for a line's original: no flavor of its own, or labeled Original. */
export const originalFlavorSql = (product: string) =>
  `(${product}.flavor IS NULL OR lower(trim(${product}.flavor))='original')`;
