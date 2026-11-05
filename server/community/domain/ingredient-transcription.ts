import { z } from "zod";
import { allergenDeclaration } from "./allergens";

const nonEmpty = z.string().trim().min(1);
const confidence = z.enum(["high", "medium", "low"]);

export const ingredientReading = z
  .object({
    reader: z.enum(["first", "blind"]),
    ingredients: nonEmpty.optional(),
    contains: nonEmpty.optional(),
    mayContain: nonEmpty.optional(),
    photosUsed: z.array(z.string().min(1)).default([]),
    confidence,
  })
  .strict();

export const ingredientTranscription = z
  .object({
    // Verbatim package text, retaining [unreadable] markers.
    ingredients: nonEmpty.optional(),
    contains: nonEmpty.optional(),
    mayContain: nonEmpty.optional(),
    // A web source is kept separate from the package transcription.
    onlineSupplement: z
      .object({
        ingredients: nonEmpty,
        contains: nonEmpty.optional(),
        mayContain: nonEmpty.optional(),
        url: z.string().url(),
        accessedAt: z.string().datetime(),
        productMatch: nonEmpty,
      })
      .strict()
      .optional(),
    readings: z.array(ingredientReading).max(2).default([]),
    verification: z.enum([
      "online_only",
      "single_read",
      "agreed",
      "corrected",
      "unresolved",
      "no_source",
    ]),
    assessment: z
      .object({
        result: z.enum([
          "none_found",
          "animal_ingredients",
          "unclear",
          "no_source",
        ]),
        animalIngredients: z.array(nonEmpty).default([]),
        unclearIngredients: z.array(nonEmpty).default([]),
      })
      .strict(),
    // Only explicit package declarations are mapped; absence is not a
    // declaration that the product has no allergens.
    allergens: allergenDeclaration.optional(),
  })
  .strict()
  .refine((record) => {
    if (record.verification === "no_source")
      return (
        !record.ingredients &&
        !record.contains &&
        !record.mayContain &&
        !record.onlineSupplement &&
        record.readings.length === 0 &&
        record.assessment.result === "no_source"
      );
    if (record.verification === "online_only")
      return (
        !record.ingredients &&
        !record.contains &&
        !record.mayContain &&
        !!record.onlineSupplement &&
        record.readings.length === 0
      );
    return record.verification === "single_read"
      ? record.readings.length === 1
      : record.readings.length === 2;
  }, "The verification state must match the number of independent readings and available sources.")
  .refine(
    (record) =>
      (record.assessment.result === "no_source") ===
      (record.verification === "no_source"),
    "Use no_source only when neither package nor online ingredient evidence is available.",
  )
  .refine(
    (record) =>
      !["none_found", "animal_ingredients"].includes(
        record.assessment.result,
      ) ||
      !!record.ingredients ||
      !!record.onlineSupplement,
    "An ingredient assessment requires a package transcription or online supplement.",
  )
  .refine(
    (record) =>
      record.assessment.result === "animal_ingredients"
        ? record.assessment.animalIngredients.length > 0
        : record.assessment.animalIngredients.length === 0,
    "List animal ingredients only when the assessment found them.",
  )
  .refine(
    (record) =>
      record.verification !== "unresolved" ||
      record.assessment.result === "unclear",
    "An unresolved reading must remain unclear for classification.",
  );

export type IngredientTranscription = z.infer<typeof ingredientTranscription>;
