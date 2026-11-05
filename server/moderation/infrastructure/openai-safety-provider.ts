import { Buffer } from "node:buffer";
import { z } from "zod";
import { ProviderError } from "../application/decision-service";
import type {
  ContentSafetyProvider,
  SafetyInput,
  SafetyResult,
} from "../domain/safety";

const categoryNames = [
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
] as const;
const resultSchema = z.object({
  model: z.string().min(1),
  results: z
    .array(
      z.object({
        flagged: z.boolean(),
        categories: z.record(z.string(), z.boolean()),
        category_scores: z.record(z.string(), z.number().min(0).max(1)),
        category_applied_input_types: z.record(
          z.string(),
          z.array(z.enum(["text", "image"])),
        ),
      }),
    )
    .length(1),
});

/** A flag on any part flags the whole contribution; scores keep their worst. */
function merged([first, ...rest]: SafetyResult[]): SafetyResult {
  const result = {
    ...first!,
    categories: { ...first!.categories },
    scores: { ...first!.scores },
    appliedInputTypes: { ...first!.appliedInputTypes },
  };
  for (const next of rest) {
    result.flagged ||= next.flagged;
    for (const name of Object.keys(next.scores)) {
      result.categories[name] =
        Boolean(result.categories[name]) || Boolean(next.categories[name]);
      result.scores[name] = Math.max(
        result.scores[name] ?? 0,
        next.scores[name]!,
      );
      result.appliedInputTypes[name] = [
        ...new Set([
          ...(result.appliedInputTypes[name] ?? []),
          ...(next.appliedInputTypes[name] ?? []),
        ]),
      ];
    }
  }
  return result;
}

export class OpenAISafetyProvider implements ContentSafetyProvider {
  readonly name = "openai";
  readonly model = "omni-moderation-latest";
  constructor(
    private readonly key: string | undefined,
    private readonly request: typeof fetch = (...args) =>
      globalThis.fetch(...args),
  ) {}
  async moderate(
    input: SafetyInput,
    signal: AbortSignal,
  ): Promise<SafetyResult> {
    if (!this.key) throw new ProviderError("not_configured");
    const images = input.images ?? [];
    if (images.some((i) => i.bytes.byteLength > 20 * 1024 * 1024))
      throw new ProviderError("input_too_large");
    const text = input.text.trim() ? [{ type: "text", text: input.text }] : [];
    const parts = images.map((i) => ({
      type: "image_url",
      image_url: {
        url: `data:${i.contentType};base64,${Buffer.from(i.bytes).toString("base64")}`,
      },
    }));
    // The endpoint accepts one image per request: the text goes with the
    // first, and any failed request fails the whole check.
    const results = await Promise.all(
      (parts.length
        ? parts.map((part, index) => (index ? [part] : [...text, part]))
        : [text]
      ).map((content) => this.check(content, signal)),
    );
    return merged(results);
  }

  private async check(
    input: unknown[],
    signal: AbortSignal,
  ): Promise<SafetyResult> {
    let response: Response;
    try {
      response = await this.request("https://api.openai.com/v1/moderations", {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: this.model, input }),
      });
    } catch {
      throw new ProviderError(signal.aborted ? "timeout" : "provider_error");
    }
    if (!response.ok) {
      const raw = response.headers.get("Retry-After");
      const retryDelay = raw
        ? Math.max(
            0,
            Number.isFinite(Number(raw))
              ? Number(raw) * 1000
              : Date.parse(raw) - Date.now(),
          )
        : undefined;
      const retryAfterMs =
        retryDelay !== undefined && Number.isFinite(retryDelay)
          ? retryDelay
          : undefined;
      throw new ProviderError(
        response.status === 429
          ? "rate_limited"
          : response.status === 401 || response.status === 403
            ? "not_configured"
            : response.status >= 500
              ? "provider_error"
              : "invalid_response",
        undefined,
        retryAfterMs,
      );
    }
    const parsed = resultSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) throw new ProviderError("invalid_response");
    const result = parsed.data.results[0]!;
    if (
      categoryNames.some(
        (name) =>
          result.categories[name] === undefined ||
          result.category_scores[name] === undefined ||
          result.category_applied_input_types[name] === undefined,
      )
    )
      throw new ProviderError("invalid_response");
    return {
      model: parsed.data.model,
      flagged: result.flagged || Object.values(result.categories).some(Boolean),
      categories: result.categories,
      scores: result.category_scores,
      appliedInputTypes: result.category_applied_input_types,
    };
  }
}
