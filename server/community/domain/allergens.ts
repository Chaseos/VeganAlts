import { z } from "zod";

// What a formula's package says about allergens (MODERATION, milestone 5).
// VeganAlts records the label; it never infers allergens or judges safety.
export const allergenKey = z.string().regex(/^[a-z][a-z_]{1,29}$/);
export const allergenDeclaration = z.discriminatedUnion("status", [
  z.object({ status: z.literal("none_declared") }).strict(),
  z
    .object({
      status: z.literal("declared"),
      contains: z.array(allergenKey).max(20),
      mayContain: z.array(allergenKey).max(20),
    })
    .strict()
    .refine(
      (d) => d.contains.length + d.mayContain.length > 0,
      "Choose at least one allergen, or say none are declared.",
    )
    .refine(
      (d) =>
        new Set([...d.contains, ...d.mayContain]).size ===
        d.contains.length + d.mayContain.length,
      "List each allergen once, as contains or may contain.",
    ),
]);
export type AllergenDeclaration = z.infer<typeof allergenDeclaration>;

// A product that contains one of these contradicts an animal-free
// classification, so the declaration is never accepted automatically and
// opens a classification review.
export const REVIEW_ALLERGENS = [
  "milk",
  "egg",
  "fish",
  "crustacean",
  "mollusc",
] as const;
export function needsClassificationReview(declaration: AllergenDeclaration) {
  return (
    declaration.status === "declared" &&
    declaration.contains.some((key) =>
      (REVIEW_ALLERGENS as readonly string[]).includes(key),
    )
  );
}

/** Sorted, so equal declarations compare equal. */
export function normalizeDeclaration(
  declaration: AllergenDeclaration,
): AllergenDeclaration {
  return declaration.status === "none_declared"
    ? { status: "none_declared" }
    : {
        status: "declared",
        contains: [...declaration.contains].sort(),
        mayContain: [...declaration.mayContain].sort(),
      };
}
export function sameDeclaration(
  a: AllergenDeclaration | null | undefined,
  b: AllergenDeclaration | null | undefined,
) {
  return (
    JSON.stringify(a ? normalizeDeclaration(a) : null) ===
    JSON.stringify(b ? normalizeDeclaration(b) : null)
  );
}

/** "Contains soy, wheat · may contain sesame" in the country's wording. */
export function describeDeclaration(
  declaration: AllergenDeclaration,
  labels: Record<string, string> = {},
) {
  if (declaration.status === "none_declared")
    return "No allergens declared on the label";
  const names = (keys: string[]) =>
    keys.map((key) => (labels[key] ?? key.replaceAll("_", " ")).toLowerCase());
  return [
    declaration.contains.length
      ? `Contains ${names(declaration.contains).join(", ")}`
      : "",
    declaration.mayContain.length
      ? `${declaration.contains.length ? "may" : "May"} contain ${names(declaration.mayContain).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
