import type { ImageSlot } from "../../media/domain/media";

export const DECISION_SCHEMA_VERSION = 1;
export const outcomes = [
  "READY",
  "NEEDS_REVIEW",
  "NEEDS_CHANGES",
  "BLOCKED",
] as const;
export type Outcome = (typeof outcomes)[number];
export const decisionKinds = [
  "comment",
  "submission",
  "image",
  "edit_proposal",
  "formula_evidence",
  "category_proposal",
] as const;
export type DecisionKind = (typeof decisionKinds)[number];
export type ModelTier = "flash" | "full";
export type SubjectType =
  "submission" | "comment" | "edit_proposal" | "category_proposal";

/** One narrow finite question. Providers return a probability per option. */
export interface Question {
  id: string;
  instructions: string;
  options: Record<string, string>;
}
export interface Answer {
  option: string;
  probabilities: Record<string, number>;
  confidence: number;
}
export type Answers = Record<string, Answer>;
export interface DecisionImage {
  contentHash: string;
  contentType: "image/webp" | "image/png" | "image/jpeg";
  bytes: Uint8Array;
}

const yesNo = (yes: string, no: string) => ({
  YES: yes,
  NO: no,
  UNCLEAR: "The content does not make this clear.",
});
const imageTypes = {
  FRONT: "Front of the retail package showing brand and product name.",
  BACK: "Back or side of the package without the ingredient list.",
  INGREDIENTS: "A readable ingredient list.",
  NUTRITION: "A nutrition facts or allergen panel.",
  PREPARED: "The product unpacked, cooked or served.",
  OTHER: "Anything else, including unrelated or unclear images.",
};
export const SLOT_TYPE: Record<ImageSlot, keyof typeof imageTypes> = {
  front: "FRONT",
  back: "BACK",
  ingredients: "INGREDIENTS",
  nutrition: "NUTRITION",
  prepared: "PREPARED",
};
const safety = {
  SAFE: "An ordinary food product photo or description.",
  UNRELATED: "Not a food product at all.",
  UNSAFE: "Explicit, violent, hateful or harassing content.",
};
const imageType = (position: number): Question => ({
  id: `image_${position}_type`,
  instructions: `Which kind of product photo is image ${position} (images are numbered in the order provided)?`,
  options: imageTypes,
});

/**
 * Provider-neutral question sets. Each question asks one narrow finite thing so
 * the policy engine, not the model, decides what an answer means. Text from
 * contributors is passed only inside the structured state, never here.
 */
export function questionsFor(kind: DecisionKind, imageCount = 0): Question[] {
  const images = Array.from({ length: imageCount }, (_, i) => imageType(i + 1));
  switch (kind) {
    case "comment":
      return [
        {
          id: "relevance",
          instructions:
            "Is the comment about this product, how it compares with the conventional food it replaces, or how to use it?",
          options: {
            RELEVANT: "About this product or the comparison.",
            PARTIALLY_RELEVANT: "Loosely related.",
            IRRELEVANT: "Unrelated to the product.",
          },
        },
        {
          id: "commercial_intent",
          instructions:
            "Does the comment promote a business, discount, link or other product for commercial gain?",
          options: {
            NONE: "No promotion.",
            POSSIBLE: "Some promotional signals.",
            LIKELY: "Clearly promotional or spam.",
          },
        },
        {
          id: "duplicate_content",
          instructions:
            "Is the comment substantially the same as one of the recent comments listed in the state?",
          options: yesNo("A near copy.", "Original."),
        },
        {
          id: "safety",
          instructions:
            "Is the comment harassing, hateful, sexually explicit or threatening?",
          options: {
            SAFE: "None of these.",
            UNSAFE: "Contains such content.",
          },
        },
        {
          id: "recommended_action",
          instructions:
            "Short or low-detail opinions are acceptable. Should this comment be shown, held for a moderator or rejected as spam?",
          options: {
            ALLOW: "Show it.",
            HOLD: "A moderator should check it.",
            REJECT_SPAM: "Spam with no product opinion.",
          },
        },
      ];
    case "submission":
      return [
        {
          id: "matches_claimed_product",
          instructions:
            "Do the photos show the brand and product named in the state?",
          options: yesNo(
            "Brand and product match.",
            "A different product or brand.",
          ),
        },
        {
          id: "commercial_product",
          instructions: "Is this a packaged product sold commercially?",
          options: yesNo("A commercial product.", "Homemade or not a product."),
        },
        {
          id: "evidence_quality",
          instructions:
            "How readable is any ingredient list shown in the photos?",
          options: {
            STRONG: "Fully readable.",
            PARTIAL: "Partly readable.",
            NONE: "No readable ingredient list.",
          },
        },
        {
          id: "category_fit",
          instructions:
            "Could this product plausibly be used in place of the conventional food categories listed in the state?",
          options: yesNo("Plausible replacement.", "Not a replacement."),
        },
        { id: "safety", instructions: "Classify the photos.", options: safety },
        ...images,
      ];
    case "image":
      return [
        imageType(1),
        {
          id: "matches_product",
          instructions:
            "Does image 1 show the brand and product named in the state?",
          options: yesNo("Brand and product match.", "A different product."),
        },
        // Image 2, when present, is the product's current front photo.
        ...(imageCount > 1
          ? [
              {
                id: "matches_reference",
                instructions: "Do image 1 and image 2 show the same product?",
                options: yesNo("The same product.", "Different products."),
              },
            ]
          : []),
        {
          id: "quality",
          instructions: "Is image 1 clear enough to be useful?",
          options: {
            CLEAR: "Sharp and well lit.",
            ACCEPTABLE: "Usable.",
            POOR: "Blurry, cropped or unreadable.",
          },
        },
        { id: "safety", instructions: "Classify image 1.", options: safety },
      ];
    case "edit_proposal":
      return [
        {
          id: "evidence_relevance",
          instructions:
            "How relevant is the provided evidence to the proposed change in the state?",
          options: {
            STRONG: "Directly shows the proposed fact.",
            PARTIAL: "Somewhat related.",
            NONE: "No relevant evidence.",
          },
        },
        {
          id: "claim_support",
          instructions:
            "Does the evidence support, contradict or leave open the proposed change?",
          options: {
            SUPPORTS: "Supports it.",
            CONTRADICTS: "Contradicts it.",
            INCONCLUSIVE: "Neither.",
          },
        },
        {
          id: "risk",
          instructions:
            "How much harm would an incorrect change cause to shoppers?",
          options: { LOW: "Minor.", MEDIUM: "Noticeable.", HIGH: "Serious." },
        },
        {
          id: "recommended_action",
          instructions: "How should this proposed change be handled?",
          options: {
            AUTO_ACCEPT_CANDIDATE: "Low risk and well supported.",
            SEEK_CONFIRMATION: "Needs independent confirmation.",
            MODERATOR_REVIEW: "Needs a moderator.",
          },
        },
        ...images,
      ];
    case "formula_evidence":
      return [
        {
          id: "ingredient_list_visible",
          instructions: "Is an ingredient list readable in the evidence?",
          options: yesNo("Readable.", "Not readable."),
        },
        {
          id: "animal_ingredient_present",
          instructions:
            "Does the readable ingredient list name an animal-derived ingredient?",
          options: yesNo("Names an animal-derived ingredient.", "Names none."),
        },
        {
          id: "claim_support",
          instructions:
            "Does the evidence support the proposed formula or classification change described in the state?",
          options: {
            SUPPORTS: "Supports it.",
            CONTRADICTS: "Contradicts it.",
            INCONCLUSIVE: "Neither.",
          },
        },
        ...images,
      ];
    case "category_proposal":
      return [
        {
          id: "food_reference",
          instructions:
            "Is the proposed category a conventional (non-vegan) food or drink that shoppers look for alternatives to?",
          options: yesNo("A conventional food or drink.", "Something else."),
        },
        {
          id: "recommended_action",
          instructions:
            "Should this category proposal go to a moderator or be rejected as spam?",
          options: {
            ALLOW: "A genuine proposal.",
            HOLD: "Unclear; a moderator should check.",
            REJECT_SPAM: "Spam or abuse.",
          },
        },
      ];
  }
}

export const MODEL_TIER: Record<DecisionKind, ModelTier> = {
  comment: "flash",
  category_proposal: "flash",
  submission: "full",
  image: "full",
  edit_proposal: "full",
  formula_evidence: "full",
};

const severity: Record<Outcome, number> = {
  READY: 0,
  NEEDS_REVIEW: 1,
  NEEDS_CHANGES: 2,
  BLOCKED: 3,
};
/** Automation can only make a deterministic decision more restrictive. */
export function combineDecisions(
  deterministic: Outcome,
  automated: Outcome | null,
): Outcome {
  if (!automated) return deterministic;
  return severity[automated] > severity[deterministic]
    ? automated
    : deterministic;
}
