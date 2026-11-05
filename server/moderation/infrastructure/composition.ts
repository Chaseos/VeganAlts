import { ModerationWorkService } from "../application/work-service";
import { D1ModerationWorkRepository } from "./d1-work-repository";
import type { WorkContext } from "../domain/work";
import { v7 as uuid } from "uuid";
import {
  ModerationDecisionService,
  type ModerationProvider,
  contentSafetyPolicy,
} from "../application/decision-service";
import { moderationPolicy } from "../domain/policy";
import { ClefDecisionProvider } from "./clef-provider";
import { D1DecisionRepository } from "./d1-decision-repository";
import { OpenAISafetyProvider } from "./openai-safety-provider";
import { FakeSafetyProvider } from "./fake-safety-provider";
import type { ContentSafetyProvider } from "../domain/safety";
import { FakeDecisionProvider } from "./fake-provider";
import { FakeTextProvider } from "./fake-text-provider";
import type { FoodTextProvider } from "../domain/food-review";

export interface ModerationEnv {
  DB: D1Database;
  APP_ENV: string;
  MODERATION_PROVIDER?: string;
  MODERATION_POLICY?: string;
  AI?: unknown;
  CONTENT_SAFETY_PROVIDER?: string;
  CONTENT_SAFETY_POLICY?: string;
  OPENAI_API_KEY?: string;
  FOOD_TEXT_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
}

export function moderationProvider(
  env: ModerationEnv,
): ModerationProvider | null {
  const mode = env.MODERATION_PROVIDER || "disabled";
  if (mode === "disabled") return null;
  if (mode === "fake") {
    if (env.APP_ENV !== "local")
      throw new Error(
        "The fake moderation provider is only available locally.",
      );
    return new FakeDecisionProvider();
  }
  if (mode === "clef") {
    const ai = env.AI as { run?: unknown } | undefined;
    if (typeof ai?.run !== "function")
      throw new Error("Clef moderation requires the AI binding.");
    return new ClefDecisionProvider(
      ai as ConstructorParameters<typeof ClefDecisionProvider>[0],
    );
  }
  throw new Error("Unknown moderation provider.");
}

export function contentSafetyProvider(
  env: ModerationEnv,
): ContentSafetyProvider | null {
  const mode = env.CONTENT_SAFETY_PROVIDER ?? "disabled";
  if (mode === "disabled") return null;
  if (mode === "openai") return new OpenAISafetyProvider(env.OPENAI_API_KEY);
  if (mode === "fake" && env.APP_ENV === "local")
    return new FakeSafetyProvider();
  throw new Error("Unknown or non-local fake content safety provider.");
}

/** Loaded on first use: most requests never need the Anthropic client. */
export async function foodTextProvider(
  env: ModerationEnv,
): Promise<FoodTextProvider | null> {
  const mode = env.FOOD_TEXT_PROVIDER ?? "disabled";
  if (mode === "disabled") return null;
  if (mode === "fake" && env.APP_ENV === "local") return new FakeTextProvider();
  if (mode === "claude") {
    if (!env.ANTHROPIC_API_KEY)
      throw new Error("Food review text requires ANTHROPIC_API_KEY.");
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const { ClaudeTextProvider } = await import("./claude-text-provider");
    return new ClaudeTextProvider(
      new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 30_000 }),
    );
  }
  throw new Error("Unknown or non-local fake food text provider.");
}

export function moderationDecisions(
  env: ModerationEnv,
  newId: () => string = uuid,
  clock = Date.now,
) {
  return new ModerationDecisionService(
    new D1DecisionRepository(env.DB),
    moderationProvider(env),
    moderationPolicy(env.MODERATION_POLICY),
    newId,
    clock,
    contentSafetyProvider(env),
    contentSafetyPolicy(env.CONTENT_SAFETY_POLICY),
  );
}

export function moderationWork(
  env: Pick<ModerationEnv, "DB">,
  newId: () => string = uuid,
  clock = Date.now,
  context?: WorkContext,
) {
  return new ModerationWorkService(
    new D1ModerationWorkRepository(env.DB),
    newId,
    clock,
    context,
  );
}
