import {
  ProviderError,
  type ModerationProvider,
  type ProviderRequest,
  type ProviderResult,
} from "../application/decision-service";
import { SLOT_TYPE, type Answers, type ModelTier } from "../domain/decisions";
import type { ImageSlot } from "../../media/domain/media";

// Favorable answers for questions whose first option is not the favorable one.
const FAVORABLE: Record<string, string> = {
  duplicate_content: "NO",
  animal_ingredient_present: "NO",
  claim_support: "SUPPORTS",
  recommended_action: "ALLOW",
};

/**
 * Deterministic local/test provider. Contributors' text can steer it with
 * markers such as `[fake:recommended_action=REJECT_SPAM]`, `[fake:error]` or
 * `[fake:rate_limited]`, so browser tests can exercise every outcome. The
 * composition refuses it outside local development.
 */
export class FakeDecisionProvider implements ModerationProvider {
  readonly name = "fake";
  model(tier: ModelTier) {
    return `fake-${tier}`;
  }
  async decide(request: ProviderRequest): Promise<ProviderResult> {
    const text = JSON.stringify(request.state);
    if (text.includes("[fake:error]"))
      throw new ProviderError("provider_error");
    if (text.includes("[fake:rate_limited]"))
      throw new ProviderError("rate_limited");
    const overrides = new Map(
      [...text.matchAll(/\[fake:([a-z0-9_]+)=([A-Z_]+)\]/g)].map((m) => [
        m[1]!,
        m[2]!,
      ]),
    );
    const slots = (
      (request.state.images as { claimedSlot?: ImageSlot }[] | undefined) ?? []
    ).map((i) => i.claimedSlot);
    const answers: Answers = {};
    for (const question of request.questions) {
      const options = Object.keys(question.options);
      const position = question.id.match(/^image_(\d+)_type$/)?.[1];
      const slot = position ? slots[Number(position) - 1] : undefined;
      let option =
        overrides.get(question.id) ??
        (slot ? SLOT_TYPE[slot] : undefined) ??
        FAVORABLE[question.id] ??
        options[0]!;
      if (!options.includes(option)) option = options[0]!;
      const rest = 0.03 / Math.max(1, options.length - 1);
      answers[question.id] = {
        option,
        probabilities: Object.fromEntries(
          options.map((o) => [o, o === option ? 0.97 : rest]),
        ),
        confidence: 0.97,
      };
    }
    return {
      model: this.model(request.tier),
      answers,
      usage: { inputTokens: text.length, outputTokens: 0 },
    };
  }
}
