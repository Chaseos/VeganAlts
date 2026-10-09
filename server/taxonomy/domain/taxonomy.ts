import { z } from "zod";
import { ApplicationError } from "../../shared/domain/errors";
import {
  countryCode,
  id,
  note,
  shortText,
} from "../../community/domain/contracts";

export { countryCode };
import { DIMENSION_KEY, MAX_DIMENSIONS } from "../../ratings/domain/details";

export const invalidCountry = () =>
  new ApplicationError(
    "INVALID_COUNTRY",
    "Choose one of the countries VeganAlts is open in.",
  );

// Route segments beneath /us/ and other words a category slug must never take.
export const RESERVED_SLUGS = new Set([
  "search",
  "products",
  "new",
  "trending",
  "top",
  "categories",
  "category",
  "api",
  "admin",
  "account",
  "sign-in",
  "media",
  "users",
  "my-ratings",
  "add-product",
  "contribute",
  "my-contributions",
  "auth",
  "propose-category",
]);
export function categorySlug(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
export function assertCategorySlug(slug: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/.test(slug) || slug.length < 2)
    throw new ApplicationError(
      "INVALID_SLUG",
      "Use 2–60 lowercase letters, numbers and hyphens.",
    );
  if (RESERVED_SLUGS.has(slug))
    throw new ApplicationError(
      "RESERVED_SLUG",
      "That address is reserved. Choose another name or slug.",
    );
}
/** Comparable name for duplicate checks: case, accents and spacing removed. */
export function categoryKey(value: string) {
  return categorySlug(value).replaceAll("-", "");
}

const aliasList = z.array(shortText).max(10).default([]);
// An ISO 3166-1 alpha-2 code; whether the country is active is checked
// against the database.
export const categoryProposalInput = z
  .object({
    name: shortText,
    // Category proposals choose the shelf the new food belongs on.
    shelfId: id,
    country: countryCode,
    explanation: note,
    exampleProducts: z.array(shortText).max(5).default([]),
    aliases: aliasList,
  })
  .strict();
// Proposals stored before milestone 5 named an optional parent instead.
export const storedCategoryProposal = z.object({
  name: shortText,
  aliases: aliasList,
});
export type CategoryProposalInput = z.infer<typeof categoryProposalInput>;
export const createCategoryInput = z
  .object({
    name: shortText,
    slug: z.string().max(60).optional(),
    parentId: id.nullable().default(null),
    isRankable: z.boolean(),
    aliases: aliasList,
    note,
  })
  .strict();
export type CreateCategoryInput = z.infer<typeof createCategoryInput>;
export const updateCategoryInput = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    name: shortText.optional(),
    slug: z.string().max(60).optional(),
    parentId: id.nullable().optional(),
    isRankable: z.boolean().optional(),
    isActive: z.boolean().optional(),
    aliases: z
      .array(
        z
          .object({
            alias: shortText,
            country: countryCode.optional(),
            // Marks a country-scoped alias as that country's name for the food.
            displayName: z.boolean().optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    note,
  })
  .strict();
export type UpdateCategoryInput = z.infer<typeof updateCategoryInput>;
export const mergeInput = z
  .object({
    donorId: id,
    survivorId: id,
    donorRevision: z.number().int().nonnegative(),
    survivorRevision: z.number().int().nonnegative(),
    note,
  })
  .strict();
export type MergeInput = z.infer<typeof mergeInput>;
export const featuresInput = z
  .object({
    categoryIds: z.array(id).max(12),
    country: countryCode.default("US"),
    note,
  })
  .strict();
// A food's full ordered question list (docs/API.md, milestone 5). Keys are
// fixed once created; `active: false` retires a question.
export const MAX_ACTIVE_DIMENSIONS = MAX_DIMENSIONS;
export const dimensionsInput = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    dimensions: z
      .array(
        z
          .object({
            key: z.string().regex(DIMENSION_KEY),
            label: z.string().trim().min(2).max(40),
            description: z.string().trim().max(200).nullable().default(null),
            active: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    note,
  })
  .strict();
export type DimensionState = z.infer<
  typeof dimensionsInput
>["dimensions"][number];
export const categoryDecision = z
  .object({
    decision: z.enum(["accept", "alias", "reject"]),
    expectedRevision: z.number().int().nonnegative(),
    note,
    slug: z.string().max(60).optional(),
    parentId: id.nullable().optional(),
    isRankable: z.boolean().default(true),
    // Existing category that receives the proposed name as an alias.
    aliasOf: id.optional(),
  })
  .strict();
export type CategoryDecision = z.infer<typeof categoryDecision>;

/** The reversible facts of one category; aliases are complete sets. */
export interface CategoryState {
  name: string;
  slug: string;
  parentId: string | null;
  isRankable: boolean;
  isActive: boolean;
  aliases: {
    alias: string;
    countryId: string | null;
    // Absent in actions recorded before milestone 5.
    displayName?: boolean;
  }[];
}
export type CategoryPatch = Partial<CategoryState>;

export const sortAliases = (aliases: CategoryState["aliases"]) =>
  aliases
    .map((a) => ({
      alias: a.alias,
      countryId: a.countryId,
      displayName: !!a.displayName,
    }))
    .sort(
      (a, b) =>
        a.alias.localeCompare(b.alias) ||
        (a.countryId ?? "").localeCompare(b.countryId ?? ""),
    );
/** Only the fields an update changes, before and after. */
export function planCategoryUpdate(
  current: CategoryState,
  next: CategoryPatch,
): { before: CategoryPatch; after: CategoryPatch } {
  const before: CategoryPatch = {},
    after: CategoryPatch = {};
  for (const key of [
    "name",
    "slug",
    "parentId",
    "isRankable",
    "isActive",
  ] as const)
    if (next[key] !== undefined && next[key] !== current[key]) {
      (before as Record<string, unknown>)[key] = current[key];
      (after as Record<string, unknown>)[key] = next[key];
    }
  if (
    next.aliases &&
    JSON.stringify(sortAliases(next.aliases)) !==
      JSON.stringify(sortAliases(current.aliases))
  ) {
    before.aliases = sortAliases(current.aliases);
    after.aliases = sortAliases(next.aliases);
  }
  if (!Object.keys(after).length)
    throw new ApplicationError("NO_CHANGE", "Nothing changed.");
  return { before, after };
}
