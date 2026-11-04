import type { DecisionImage } from "./decisions";

export interface SafetyInput {
  /** Only newly contributed content, never reference or other users' content. */
  text: string;
  images?: DecisionImage[];
}
export interface SafetyResult {
  model: string;
  flagged: boolean;
  categories: Record<string, boolean>;
  scores: Record<string, number>;
  appliedInputTypes: Record<string, ("text" | "image")[]>;
}
export interface ContentSafetyProvider {
  readonly name: string;
  readonly model: string;
  moderate(input: SafetyInput, signal: AbortSignal): Promise<SafetyResult>;
}

/** Extract string values from a validated contribution, never its context. */
export function contributedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.map(contributedText).filter(Boolean).join("\n");
  if (value && typeof value === "object")
    return Object.entries(value)
      .filter(
        ([key]) =>
          !/Ids?$/.test(key) &&
          !["expectedRevision", "expectedUpdatedAt", "followUp"].includes(key),
      )
      .map(([, item]) => contributedText(item))
      .filter(Boolean)
      .join("\n");
  return "";
}
