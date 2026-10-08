import type { ImageSlot } from "../../media/domain/media";
import {
  SLOT_TYPE,
  type Answers,
  type DecisionKind,
  type Outcome,
} from "./decisions";

export const POLICY_VERSION = 1;
const DAY = 86_400_000;

/**
 * Provisional thresholds, calibrated against the labeled fixture set and
 * recorded in the milestone verification. Every value is overridable through
 * the MODERATION_POLICY variable.
 */
export const DEFAULT_MODERATION_POLICY = {
  daily: 300,
  accountDaily: 30,
  concurrent: 2,
  reuseDays: 30,
  timeoutMs: 15_000,
  leaseMs: 60_000,
  block: 0.95,
  hold: 0.6,
  mismatch: 0.8,
  wrongType: 0.7,
  ready: 0.7,
  unsafe: 0.5,
};
export type ModerationPolicy = typeof DEFAULT_MODERATION_POLICY;
const PROBABILITIES = new Set([
  "block",
  "hold",
  "mismatch",
  "wrongType",
  "ready",
  "unsafe",
]);
export function moderationPolicy(value?: string): ModerationPolicy {
  if (!value) return { ...DEFAULT_MODERATION_POLICY };
  const overrides: unknown = JSON.parse(value);
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Invalid moderation policy.");
  const result = { ...DEFAULT_MODERATION_POLICY };
  for (const [name, raw] of Object.entries(overrides)) {
    if (
      !(name in result) ||
      typeof raw !== "number" ||
      raw <= 0 ||
      (PROBABILITIES.has(name) ? raw > 1 : !Number.isSafeInteger(raw))
    )
      throw new Error("Invalid moderation policy value.");
    result[name as keyof ModerationPolicy] = raw;
  }
  return result;
}
export const reuseWindow = (policy: ModerationPolicy) => policy.reuseDays * DAY;

export interface PolicyContext {
  /** Claimed slot for each submitted image, in the order they were sent. */
  slots?: ImageSlot[];
  /** Whether a photo is the only ingredient evidence (no manufacturer URL). */
  ingredientPhotoRequired?: boolean;
}
export interface PolicyResult {
  outcome: Outcome;
  reasons: string[];
  /** Operator-facing signals that never change the outcome on their own. */
  flags: string[];
}

const p = (answers: Answers, question: string, option: string) =>
  answers[question]?.probabilities[option] ?? 0;

function imageTypeIssues(
  answers: Answers,
  slots: ImageSlot[],
  policy: ModerationPolicy,
) {
  const reasons: string[] = [],
    uncertain: string[] = [];
  slots.forEach((slot, index) => {
    const question = `image_${index + 1}_type`;
    const claimed = p(answers, question, SLOT_TYPE[slot]);
    const answer = answers[question];
    if (!answer) return;
    if (
      claimed < 1 - policy.wrongType &&
      answer.option !== SLOT_TYPE[slot] &&
      (answer.probabilities[answer.option] ?? 0) >= policy.wrongType
    )
      reasons.push(
        `The ${slot} photo looks like a ${answer.option.toLowerCase()} photo. Upload a clear ${slot} photo.`,
      );
    else if (claimed < policy.ready) uncertain.push(slot);
  });
  return { reasons, uncertain };
}

/**
 * Converts structured probabilities into a VeganAlts outcome. Uncertainty
 * becomes NEEDS_REVIEW, never a rejection; BLOCKED needs near-certain abuse.
 */
export function evaluatePolicy(
  kind: DecisionKind,
  answers: Answers,
  context: PolicyContext,
  policy: ModerationPolicy,
): PolicyResult {
  const flags: string[] = [];
  switch (kind) {
    case "comment": {
      if (p(answers, "recommended_action", "REJECT_SPAM") >= policy.block)
        return {
          outcome: "BLOCKED",
          reasons: ["This comment looks like spam and was not posted."],
          flags: ["spam"],
        };
      if (p(answers, "safety", "UNSAFE") >= policy.unsafe) flags.push("unsafe");
      if (p(answers, "commercial_intent", "LIKELY") >= policy.hold)
        flags.push("commercial");
      if (p(answers, "duplicate_content", "YES") >= policy.mismatch)
        flags.push("duplicate");
      if (p(answers, "relevance", "IRRELEVANT") >= policy.mismatch)
        flags.push("off_topic");
      if (
        p(answers, "recommended_action", "REJECT_SPAM") >= policy.hold ||
        p(answers, "recommended_action", "HOLD") >= policy.ready
      )
        flags.push("held");
      return flags.length
        ? {
            outcome: "NEEDS_REVIEW",
            reasons: ["Your comment will appear after a moderator checks it."],
            flags,
          }
        : { outcome: "READY", reasons: [], flags };
    }
    case "submission":
    case "image": {
      const reasons: string[] = [];
      if (p(answers, "safety", "UNSAFE") >= policy.block)
        return {
          outcome: "BLOCKED",
          reasons: ["These photos cannot be accepted."],
          flags: ["unsafe"],
        };
      if (p(answers, "safety", "UNRELATED") >= policy.mismatch)
        reasons.push("The photos do not appear to show a food product.");
      const match =
        kind === "submission" ? "matches_claimed_product" : "matches_product";
      if (
        p(answers, match, "NO") >= policy.mismatch ||
        p(answers, "matches_reference", "NO") >= policy.mismatch
      )
        reasons.push(
          "The photos do not appear to show this product. Check the brand and product name or retake the photos.",
        );
      const types = imageTypeIssues(answers, context.slots ?? [], policy);
      reasons.push(...types.reasons);
      if (
        kind === "submission" &&
        p(answers, "category_fit", "NO") >= policy.mismatch
      )
        reasons.push(
          "This product may not replace the selected category. Check the categories.",
        );
      if (reasons.length) return { outcome: "NEEDS_CHANGES", reasons, flags };
      if (p(answers, match, "YES") < policy.ready) flags.push("identity");
      if (types.uncertain.length) flags.push("image_type");
      if (kind === "image" && p(answers, "quality", "POOR") >= 0.5)
        flags.push("quality");
      if (kind === "submission") {
        if (p(answers, "commercial_product", "YES") < policy.ready)
          flags.push("commercial_product");
        if (p(answers, "category_fit", "YES") < policy.ready)
          flags.push("category_fit");
        if (
          context.ingredientPhotoRequired &&
          p(answers, "evidence_quality", "NONE") >= 0.5
        )
          flags.push("ingredient_evidence");
      }
      return flags.length
        ? {
            outcome: "NEEDS_REVIEW",
            reasons: ["An automated evidence check was inconclusive."],
            flags,
          }
        : { outcome: "READY", reasons: [], flags };
    }
    case "edit_proposal": {
      if (p(answers, "claim_support", "CONTRADICTS") >= policy.mismatch)
        return {
          outcome: "NEEDS_CHANGES",
          reasons: [
            "The evidence appears to contradict this change. Check the details or add clearer evidence.",
          ],
          flags: ["contradicts"],
        };
      const supported =
        p(answers, "claim_support", "SUPPORTS") >= policy.ready &&
        p(answers, "evidence_relevance", "STRONG") +
          p(answers, "evidence_relevance", "PARTIAL") >=
          policy.ready &&
        p(answers, "recommended_action", "MODERATOR_REVIEW") < 0.5;
      if (p(answers, "risk", "HIGH") >= 0.5) flags.push("high_risk");
      return supported && !flags.length
        ? { outcome: "READY", reasons: [], flags }
        : {
            outcome: "NEEDS_REVIEW",
            reasons: ["This change needs confirmation or a moderator."],
            flags: supported ? flags : [...flags, "evidence"],
          };
    }
    case "formula_evidence": {
      if (p(answers, "ingredient_list_visible", "NO") >= policy.mismatch)
        return {
          outcome: "NEEDS_CHANGES",
          reasons: [
            "The ingredient list is not readable. Add a clearer ingredient photo.",
          ],
          flags: ["unreadable"],
        };
      if (p(answers, "animal_ingredient_present", "YES") >= policy.ready)
        flags.push("animal_ingredient");
      if (p(answers, "claim_support", "CONTRADICTS") >= policy.mismatch)
        flags.push("contradicts");
      // Formula and classification changes are always operator decisions.
      return {
        outcome: "NEEDS_REVIEW",
        reasons: ["A moderator will review this evidence."],
        flags,
      };
    }
    case "category_proposal": {
      if (p(answers, "recommended_action", "REJECT_SPAM") >= policy.block)
        return {
          outcome: "BLOCKED",
          reasons: ["This proposal looks like spam and was not submitted."],
          flags: ["spam"],
        };
      if (p(answers, "food_reference", "NO") >= 0.9)
        return {
          outcome: "NEEDS_CHANGES",
          reasons: [
            "Propose the conventional food or drink people want to replace, such as “Ground Beef”.",
          ],
          flags: ["not_food"],
        };
      return {
        outcome: "NEEDS_REVIEW",
        reasons: ["A moderator will review this category."],
        flags,
      };
    }
  }
}
