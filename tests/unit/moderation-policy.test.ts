import { describe, expect, it } from "vitest";
import {
  combineDecisions,
  questionsFor,
  type Answers,
  type Question,
} from "../../server/moderation/domain/decisions";
import {
  DEFAULT_MODERATION_POLICY,
  evaluatePolicy,
  moderationPolicy,
} from "../../server/moderation/domain/policy";
import { ClefDecisionProvider } from "../../server/moderation/infrastructure/clef-provider";
import { FakeDecisionProvider } from "../../server/moderation/infrastructure/fake-provider";
import { moderationProvider } from "../../server/moderation/infrastructure/composition";
import { ProviderError } from "../../server/moderation/application/decision-service";

const policy = DEFAULT_MODERATION_POLICY;
function answers(
  questions: Question[],
  chosen: Record<string, [string, number]>,
) {
  const result: Answers = {};
  for (const q of questions) {
    const options = Object.keys(q.options);
    const [option, p] = chosen[q.id] ?? [options[0]!, 0.9];
    result[q.id] = {
      option,
      confidence: p,
      probabilities: Object.fromEntries(
        options.map((o) => [
          o,
          o === option ? p : (1 - p) / (options.length - 1),
        ]),
      ),
    };
  }
  return result;
}

describe("decision combination", () => {
  it("lets automation tighten but never loosen a deterministic outcome", () => {
    expect(combineDecisions("READY", null)).toBe("READY");
    expect(combineDecisions("READY", "NEEDS_REVIEW")).toBe("NEEDS_REVIEW");
    expect(combineDecisions("NEEDS_REVIEW", "READY")).toBe("NEEDS_REVIEW");
    expect(combineDecisions("NEEDS_REVIEW", "NEEDS_CHANGES")).toBe(
      "NEEDS_CHANGES",
    );
    expect(combineDecisions("NEEDS_CHANGES", "READY")).toBe("NEEDS_CHANGES");
    expect(combineDecisions("NEEDS_REVIEW", "BLOCKED")).toBe("BLOCKED");
  });
});

describe("comment policy", () => {
  const q = questionsFor("comment");
  it("allows short ordinary opinions", () => {
    const a = answers(q, {
      duplicate_content: ["NO", 0.9],
      recommended_action: ["ALLOW", 0.9],
    });
    expect(evaluatePolicy("comment", a, {}, policy).outcome).toBe("READY");
  });
  it("holds uncertain spam and blocks only near-certain spam", () => {
    const base = { duplicate_content: ["NO", 0.9] as [string, number] };
    expect(
      evaluatePolicy(
        "comment",
        answers(q, { ...base, recommended_action: ["REJECT_SPAM", 0.7] }),
        {},
        policy,
      ),
    ).toMatchObject({ outcome: "NEEDS_REVIEW", flags: ["held"] });
    expect(
      evaluatePolicy(
        "comment",
        answers(q, { ...base, recommended_action: ["REJECT_SPAM", 0.97] }),
        {},
        policy,
      ).outcome,
    ).toBe("BLOCKED");
    expect(
      evaluatePolicy(
        "comment",
        answers(q, {
          ...base,
          recommended_action: ["ALLOW", 0.9],
          commercial_intent: ["LIKELY", 0.8],
        }),
        {},
        policy,
      ),
    ).toMatchObject({ outcome: "NEEDS_REVIEW", flags: ["commercial"] });
  });
});

describe("image policy", () => {
  it("asks for changes on a confident slot mismatch and reviews uncertainty", () => {
    const q = questionsFor("submission", 2);
    const base = {
      matches_claimed_product: ["YES", 0.95],
      commercial_product: ["YES", 0.95],
      category_fit: ["YES", 0.95],
      safety: ["SAFE", 0.99],
      image_1_type: ["FRONT", 0.95],
    } as Record<string, [string, number]>;
    const context = { slots: ["front", "ingredients"] as const };
    expect(
      evaluatePolicy(
        "submission",
        answers(q, { ...base, image_2_type: ["INGREDIENTS", 0.9] }),
        { slots: [...context.slots] },
        policy,
      ).outcome,
    ).toBe("READY");
    const wrong = evaluatePolicy(
      "submission",
      answers(q, { ...base, image_2_type: ["FRONT", 0.92] }),
      { slots: [...context.slots] },
      policy,
    );
    expect(wrong.outcome).toBe("NEEDS_CHANGES");
    expect(wrong.reasons[0]).toContain("ingredients photo looks like a front");
    expect(
      evaluatePolicy(
        "submission",
        answers(q, {
          ...base,
          image_2_type: ["INGREDIENTS", 0.9],
          matches_claimed_product: ["UNCLEAR", 0.6],
        }),
        { slots: [...context.slots] },
        policy,
      ),
    ).toMatchObject({ outcome: "NEEDS_REVIEW", flags: ["identity"] });
    expect(
      evaluatePolicy(
        "submission",
        answers(q, {
          ...base,
          image_2_type: ["INGREDIENTS", 0.9],
          matches_claimed_product: ["NO", 0.9],
        }),
        { slots: [...context.slots] },
        policy,
      ).outcome,
    ).toBe("NEEDS_CHANGES");
  });
  it("never lets formula evidence become an automatic approval", () => {
    const q = questionsFor("formula_evidence");
    const result = evaluatePolicy(
      "formula_evidence",
      answers(q, {
        ingredient_list_visible: ["YES", 0.99],
        animal_ingredient_present: ["YES", 0.9],
        claim_support: ["SUPPORTS", 0.99],
      }),
      {},
      policy,
    );
    expect(result).toMatchObject({
      outcome: "NEEDS_REVIEW",
      flags: ["animal_ingredient"],
    });
  });
});

describe("policy configuration", () => {
  it("validates overrides strictly", () => {
    expect(moderationPolicy('{"daily":5,"hold":0.5}')).toMatchObject({
      daily: 5,
      hold: 0.5,
    });
    expect(() => moderationPolicy('{"hold":2}')).toThrow();
    expect(() => moderationPolicy('{"daily":1.5}')).toThrow();
    expect(() => moderationPolicy('{"unknown":1}')).toThrow();
  });
  it("refuses the fake provider outside local development", () => {
    const db = {} as D1Database;
    expect(() =>
      moderationProvider({
        DB: db,
        APP_ENV: "staging",
        MODERATION_PROVIDER: "fake",
      }),
    ).toThrow();
    expect(
      moderationProvider({
        DB: db,
        APP_ENV: "local",
        MODERATION_PROVIDER: "fake",
      }),
    ).toBeInstanceOf(FakeDecisionProvider);
    expect(
      moderationProvider({
        DB: db,
        APP_ENV: "production",
        MODERATION_PROVIDER: "disabled",
      }),
    ).toBeNull();
    expect(() =>
      moderationProvider({
        DB: db,
        APP_ENV: "staging",
        MODERATION_PROVIDER: "clef",
      }),
    ).toThrow();
  });
});

describe("Clef provider", () => {
  const questions = questionsFor("comment");
  const response = (override: Record<string, unknown> = {}) => ({
    model: "clef-flash",
    answers: Object.fromEntries(
      questions.map((q) => {
        const options = Object.keys(q.options);
        return [
          q.id,
          {
            type: "choice",
            choice: options[0],
            probabilities: Object.fromEntries(
              options.map((o, i) => [
                o,
                i ? 0.05 : 1 - 0.05 * (options.length - 1),
              ]),
            ),
            confidence: 0.9,
          },
        ];
      }),
    ),
    usage: { input_tokens: 120, output_tokens: 0 },
    ...override,
  });
  it("sends typed choice questions and maps validated answers", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const provider = new ClefDecisionProvider({
      async run(model, input) {
        calls.push([model, input as Record<string, unknown>]);
        return response();
      },
    });
    const result = await provider.decide({
      tier: "flash",
      state: { comment: { body: "Great texture." } },
      questions,
      images: [
        {
          contentHash: "x",
          contentType: "image/webp",
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
    });
    expect(calls[0]![0]).toBe("@cf/cloudflare/clef-flash");
    expect(calls[0]![1]).toMatchObject({
      model: "clef-flash",
      questions: {
        relevance: { type: "choice", criteria: expect.any(Object) },
      },
      images: [{ content_type: "image/webp", base64: "AQID" }],
    });
    expect(result.answers.relevance!.option).toBe("RELEVANT");
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 0 });
  });
  it("rejects malformed, partial and failed responses", async () => {
    const run = (value: unknown) =>
      new ClefDecisionProvider({ run: async () => value }).decide({
        tier: "full",
        state: {},
        questions,
        images: [],
      });
    await expect(
      run({ answers: {}, usage: { input_tokens: 1, output_tokens: 0 } }),
    ).rejects.toMatchObject({ code: "invalid_response" });
    const partial = response();
    (partial.answers as Record<string, { choice: string }>).relevance!.choice =
      "MAYBE";
    await expect(run(partial)).rejects.toMatchObject({
      code: "invalid_response",
    });
    await expect(
      new ClefDecisionProvider({
        run: async () => {
          throw new Error("429 Too Many Requests");
        },
      }).decide({ tier: "full", state: {}, questions, images: [] }),
    ).rejects.toEqual(new ProviderError("rate_limited"));
  });
});

describe("fake provider", () => {
  it("is deterministic and steerable by explicit markers", async () => {
    const provider = new FakeDecisionProvider();
    const questions = questionsFor("comment");
    const allow = await provider.decide({
      tier: "flash",
      state: { comment: "Tastes close to the original." },
      questions,
      images: [],
    });
    expect(allow.answers.recommended_action!.option).toBe("ALLOW");
    expect(allow.answers.duplicate_content!.option).toBe("NO");
    const spam = await provider.decide({
      tier: "flash",
      state: { comment: "Buy now [fake:recommended_action=REJECT_SPAM]" },
      questions,
      images: [],
    });
    expect(spam.answers.recommended_action!.option).toBe("REJECT_SPAM");
    await expect(
      provider.decide({
        tier: "flash",
        state: { c: "[fake:error]" },
        questions,
        images: [],
      }),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});
