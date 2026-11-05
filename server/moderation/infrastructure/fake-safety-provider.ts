import { ProviderError } from "../application/decision-service";
import type {
  ContentSafetyProvider,
  SafetyInput,
  SafetyResult,
} from "../domain/safety";

/** Explicit local fixture markers; never enabled on shared environments. */
export class FakeSafetyProvider implements ContentSafetyProvider {
  readonly name = "fake-safety";
  readonly model = "fake-safety-v1";
  async moderate(input: SafetyInput): Promise<SafetyResult> {
    if (input.text.includes("[safety:unavailable]"))
      throw new ProviderError("provider_error");
    const flagged = input.text.includes("[safety:blocked]");
    return {
      model: this.model,
      flagged,
      categories: { harassment: flagged },
      scores: { harassment: flagged ? 0.8 : 0.01 },
      appliedInputTypes: { harassment: ["text"] },
    };
  }
}
