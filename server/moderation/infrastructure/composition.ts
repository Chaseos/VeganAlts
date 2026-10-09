import { v7 as uuid } from "uuid";
import {
  ModerationDecisionService,
  type ModerationProvider,
} from "../application/decision-service";
import { moderationPolicy } from "../domain/policy";
import { ClefDecisionProvider } from "./clef-provider";
import { D1DecisionRepository } from "./d1-decision-repository";
import { FakeDecisionProvider } from "./fake-provider";

export interface ModerationEnv {
  DB: D1Database;
  APP_ENV: string;
  MODERATION_PROVIDER?: string;
  MODERATION_POLICY?: string;
  AI?: unknown;
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
  );
}
