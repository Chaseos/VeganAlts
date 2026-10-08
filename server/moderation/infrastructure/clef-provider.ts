import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  ProviderError,
  type ModerationProvider,
  type ProviderRequest,
  type ProviderResult,
} from "../application/decision-service";
import type { Answers, ModelTier } from "../domain/decisions";

const MODELS: Record<ModelTier, { id: string; selector: string }> = {
  flash: { id: "@cf/cloudflare/clef-flash", selector: "clef-flash" },
  full: { id: "@cf/cloudflare/clef", selector: "clef" },
};
// Clef limits: 4 images, 4 MiB each, 8 MiB decoded in total.
const MAX_IMAGE = 4 * 1024 * 1024,
  MAX_IMAGES = 8 * 1024 * 1024;

const probability = z.number().min(0).max(1);
const output = z.object({
  answers: z.record(
    z.string(),
    z.object({
      type: z.literal("choice"),
      choice: z.string(),
      probabilities: z.record(z.string(), probability),
      confidence: probability,
    }),
  ),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});

/**
 * The Workers AI binding is typed for the model catalog shipped with the
 * runtime types, which may not include newly released models. This narrow
 * structural type is the documented integration boundary.
 */
interface WorkersAi {
  run(model: string, input: unknown): Promise<unknown>;
}

export class ClefDecisionProvider implements ModerationProvider {
  readonly name = "clef";
  constructor(private readonly ai: WorkersAi) {}
  model(tier: ModelTier) {
    return MODELS[tier].id;
  }
  async decide(request: ProviderRequest): Promise<ProviderResult> {
    let total = 0;
    for (const image of request.images) {
      total += image.bytes.byteLength;
      if (image.bytes.byteLength > MAX_IMAGE || total > MAX_IMAGES)
        throw new ProviderError("input_too_large");
    }
    if (request.images.length > 4) throw new ProviderError("input_too_large");
    let raw: unknown;
    try {
      raw = await this.ai.run(MODELS[request.tier].id, {
        model: MODELS[request.tier].selector,
        state: request.state,
        questions: Object.fromEntries(
          request.questions.map((q) => [
            q.id,
            {
              type: "choice",
              instructions: q.instructions,
              criteria: q.options,
            },
          ]),
        ),
        ...(request.images.length
          ? {
              images: request.images.map((i) => ({
                content_type: i.contentType,
                base64: Buffer.from(i.bytes).toString("base64"),
              })),
            }
          : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new ProviderError(
        /429|rate|capacity|3040|3036/i.test(message)
          ? "rate_limited"
          : "provider_error",
      );
    }
    const parsed = output.safeParse(raw);
    if (!parsed.success) throw new ProviderError("invalid_response");
    const answers: Answers = {};
    for (const question of request.questions) {
      const answer = parsed.data.answers[question.id];
      const options = Object.keys(question.options);
      // Every finite answer must use exactly the options that were asked.
      if (
        !answer ||
        !options.includes(answer.choice) ||
        options.some((o) => answer.probabilities[o] === undefined)
      )
        throw new ProviderError("invalid_response");
      answers[question.id] = {
        option: answer.choice,
        probabilities: Object.fromEntries(
          options.map((o) => [o, answer.probabilities[o]!]),
        ),
        confidence: answer.confidence,
      };
    }
    return {
      model: MODELS[request.tier].id,
      answers,
      usage: {
        inputTokens: parsed.data.usage.input_tokens,
        outputTokens: parsed.data.usage.output_tokens,
      },
    };
  }
}
