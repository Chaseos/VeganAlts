import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  TEXT_INSTRUCTIONS,
  textOutput,
  textRequest,
  type FoodTextProvider,
  type SuggestedName,
} from "../domain/food-review";
import { ProviderError } from "../application/decision-service";

const MODEL = "claude-haiku-5-5";

/** Writes English context for suggested foods. Thinking stays off: it's billed. */
export class ClaudeTextProvider implements FoodTextProvider {
  readonly name = "claude";
  constructor(private readonly client: Anthropic) {}
  async describe(food: SuggestedName) {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 1500,
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: zodOutputFormat(textOutput) },
        system: TEXT_INSTRUCTIONS,
        messages: [{ role: "user", content: textRequest(food) }],
      });
    } catch {
      throw new ProviderError("provider_error");
    }
    if (response.stop_reason === "refusal") return null;
    const block = response.content.find((part) => part.type === "text");
    try {
      const parsed = textOutput.safeParse(JSON.parse(block?.text ?? ""));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
