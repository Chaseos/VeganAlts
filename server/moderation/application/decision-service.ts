import {
  DECISION_SCHEMA_VERSION,
  MODEL_TIER,
  questionsFor,
  combineDecisions,
  type Answers,
  type DecisionImage,
  type DecisionKind,
  type ModelTier,
  type Outcome,
  type Question,
  type SubjectType,
} from "../domain/decisions";
import {
  POLICY_VERSION,
  evaluatePolicy,
  reuseWindow,
  type ModerationPolicy,
  type PolicyContext,
} from "../domain/policy";
import type {
  ContentSafetyProvider,
  SafetyInput,
  SafetyResult,
} from "../domain/safety";
import type { DecisionBase, DecisionRepository } from "./repository";

export interface ProviderRequest {
  tier: ModelTier;
  state: Record<string, unknown>;
  questions: Question[];
  images: DecisionImage[];
}
export interface ProviderResult {
  model: string;
  answers: Answers;
  usage: { inputTokens: number; outputTokens: number };
}
export interface ModerationProvider {
  readonly name: string;
  model(tier: ModelTier): string;
  decide(request: ProviderRequest): Promise<ProviderResult>;
}
export class ProviderError extends Error {
  constructor(
    readonly code:
      | "timeout"
      | "rate_limited"
      | "invalid_response"
      | "provider_error"
      | "input_too_large"
      | "not_configured",
    message?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message ?? code);
  }
}
class ProviderCapacityError extends Error {}
export interface DecisionRequest {
  kind: DecisionKind;
  subject: { type: SubjectType; id: string };
  userId: string;
  state: Record<string, unknown>;
  images?: DecisionImage[];
  context?: PolicyContext;
  safety?: SafetyInput;
  // Replaces the kind's fixed questions.
  questions?: Question[];
}
export interface DecisionResult {
  id: string | null;
  status: "disabled" | "completed" | "reused" | "failed" | "over_budget";
  outcome: Outcome | null;
  reasons: string[];
  flags: string[];
  answers?: Answers;
  errorCode?: string;
  retryAfterMs?: number;
  budgetScope?: "account" | "environment" | "busy";
}
interface Stage<T> {
  provider: string;
  model: string;
  reused: boolean;
  result: T;
}
export interface StoredResult {
  relatedDecisionIds?: string[];
  answers: Answers;
  reasons: string[];
  flags: string[];
  safety?: Stage<SafetyResult>;
  evidence?: Stage<ProviderResult>;
}
export interface SafetyPolicy {
  timeoutMs: number;
  reuseDays: number;
}
export function contentSafetyPolicy(value?: string): SafetyPolicy {
  const result = { timeoutMs: 15_000, reuseDays: 30 };
  const overrides: unknown = value ? JSON.parse(value) : {};
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Invalid content safety policy.");
  for (const [key, raw] of Object.entries(overrides)) {
    if (
      !(key in result) ||
      typeof raw !== "number" ||
      !Number.isSafeInteger(raw) ||
      raw <= 0
    )
      throw new Error("Invalid content safety policy.");
    result[key as keyof SafetyPolicy] = raw;
  }
  return result;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export async function decisionHash(value: unknown) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(stable(value))),
      ),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** One authoritative decision; provider attempts retain successful stages for retry. */
export class ModerationDecisionService {
  constructor(
    private readonly repository: DecisionRepository,
    private readonly provider: ModerationProvider | null,
    private readonly policy: ModerationPolicy,
    private readonly newId: () => string,
    private readonly clock = Date.now,
    private readonly safetyProvider: ContentSafetyProvider | null = null,
    private readonly safetyPolicy: SafetyPolicy = contentSafetyPolicy(),
  ) {}
  get enabled() {
    return this.provider !== null || this.safetyProvider !== null;
  }
  get safetyEnabled() {
    return this.safetyProvider !== null;
  }
  latest(type: SubjectType, id: string) {
    return this.repository.latest(type, id);
  }
  async latestCheck(type: SubjectType, id: string) {
    const row = await this.latest(type, id);
    if (!row) return null;
    const result = row.result_data
      ? (JSON.parse(row.result_data) as Partial<StoredResult>)
      : null;
    return { outcome: row.outcome, flags: result?.flags ?? [] };
  }
  async restrictSubject(
    type: SubjectType,
    id: string,
    related: DecisionResult,
  ) {
    const row = await this.latest(type, id);
    if (!row || !row.result_data || !related.outcome) return;
    const stored = JSON.parse(row.result_data) as StoredResult;
    stored.reasons = [...new Set([...stored.reasons, ...related.reasons])];
    stored.flags = [
      ...new Set([
        ...stored.flags,
        ...related.flags.map((flag) => `related:${flag}`),
      ]),
    ];
    stored.relatedDecisionIds = related.id
      ? [...(stored.relatedDecisionIds ?? []), related.id]
      : stored.relatedDecisionIds;
    await this.repository.restrict(
      row.id,
      combineDecisions(row.outcome ?? "READY", related.outcome),
      JSON.stringify(stored),
    );
  }
  expireLeases() {
    return this.repository.expireLeases(this.clock());
  }
  async evaluate(request: DecisionRequest): Promise<DecisionResult> {
    const provider = request.kind === "content_safety" ? null : this.provider;
    if (!provider && !this.safetyProvider)
      return {
        id: null,
        status: "disabled",
        outcome: null,
        reasons: [],
        flags: [],
      };
    const images = request.images ?? [],
      tier = MODEL_TIER[request.kind];
    const model = [this.safetyProvider?.model, provider?.model(tier)]
      .filter(Boolean)
      .join(" + ");
    const versions = {
      kind: request.kind,
      schemaVersion: DECISION_SCHEMA_VERSION,
      policyVersion: POLICY_VERSION,
      model,
    };
    const safety = request.safety;
    const inputHash = await decisionHash({
      ...versions,
      provider: provider?.name,
      safetyProvider: this.safetyProvider?.name,
      policy: this.policy,
      safetyPolicy: this.safetyPolicy,
      state: request.state,
      images: images.map((i) => i.contentHash),
      context: request.context,
      safety: safety && {
        text: safety.text,
        images: safety.images?.map((i) => i.contentHash),
      },
    });
    const base: DecisionBase = {
      ...versions,
      id: this.newId(),
      subject: request.subject,
      provider: [this.safetyProvider?.name, provider?.name]
        .filter(Boolean)
        .join(" + "),
      inputHash,
      userId: request.userId,
      now: this.clock(),
    };
    const prior = await this.repository.reusable(
      versions,
      inputHash,
      base.now - reuseWindow(this.policy),
    );
    if (prior) {
      await this.repository.recordReused(base, prior.id, prior.outcome);
      const result = JSON.parse(prior.result_data) as StoredResult;
      return {
        id: base.id,
        status: "reused",
        outcome: prior.outcome,
        reasons: result.reasons,
        flags: result.flags,
        answers: result.answers,
      };
    }
    if (!(await this.repository.reserve(base, this.policy))) {
      const scope = await this.repository.budgetScope(base, this.policy);
      const id = await this.repository.recordOverBudget(base);
      return {
        id,
        status: "over_budget",
        outcome: "NEEDS_REVIEW",
        reasons: [
          "The automated check allowance is exhausted. Please try again later.",
        ],
        flags: ["over_budget"],
        budgetScope: scope,
        retryAfterMs:
          scope === "busy" ? 60_000 : 86_400_000 - (base.now % 86_400_000),
      };
    }
    const started = this.clock();
    const stored: StoredResult = { answers: {}, reasons: [], flags: [] };
    try {
      let outcome: Outcome = "READY";
      if (this.safetyProvider) {
        if (!safety) throw new ProviderError("invalid_response");
        stored.safety = await this.stage(
          base,
          "safety",
          this.safetyProvider.name,
          this.safetyProvider.model,
          {
            policy: this.safetyPolicy,
            text: safety.text,
            images: safety.images?.map((i) => i.contentHash),
          },
          this.safetyPolicy.reuseDays * 86_400_000,
          (signal) => this.safetyProvider!.moderate(safety, signal),
          this.safetyPolicy.timeoutMs,
        );
        if (stored.safety.result.flagged) {
          outcome = "BLOCKED";
          stored.flags = Object.entries(stored.safety.result.categories)
            .filter(([, flag]) => flag)
            .map(([name]) => `safety:${name}`);
          stored.reasons = [
            "This contribution was flagged by the safety check. Please revise the text or photos before submitting again. If this seems incorrect, contact us to appeal.",
          ];
        }
      }
      if (outcome !== "BLOCKED" && provider) {
        const questions =
          request.questions ?? questionsFor(request.kind, images.length);
        stored.evidence = await this.stage(
          base,
          "evidence",
          provider.name,
          provider.model(tier),
          {
            kind: request.kind,
            policy: this.policy,
            state: request.state,
            images: images.map((i) => i.contentHash),
            context: request.context,
          },
          reuseWindow(this.policy),
          async () => {
            const result = await provider.decide({
              tier,
              state: request.state,
              questions,
              images,
            });
            if (questions.some((q) => !result.answers[q.id]))
              throw new ProviderError("invalid_response");
            return result;
          },
          this.policy.timeoutMs,
        );
        stored.answers = stored.evidence.result.answers;
        const policy = evaluatePolicy(
          request.kind,
          stored.answers,
          request.context ?? {},
          this.policy,
        );
        outcome = policy.outcome;
        stored.reasons = policy.reasons;
        stored.flags = policy.flags;
      }
      if (
        !(await this.repository.complete(base.id, {
          outcome,
          resultData: JSON.stringify(stored),
          inputTokens: stored.evidence?.result.usage.inputTokens ?? 0,
          outputTokens: stored.evidence?.result.usage.outputTokens ?? 0,
          latencyMs: this.clock() - started,
          now: this.clock(),
        }))
      )
        throw new ProviderError("timeout");
      return {
        id: base.id,
        status: "completed",
        outcome,
        reasons: stored.reasons,
        flags: stored.flags,
        answers: stored.answers,
      };
    } catch (error) {
      if (error instanceof ProviderCapacityError) {
        await this.repository.fail(
          base.id,
          "over_budget",
          this.clock() - started,
          this.clock(),
        );
        return {
          id: base.id,
          status: "over_budget",
          outcome: "NEEDS_REVIEW",
          reasons: [
            "Automated checks are at capacity. Please try again later.",
          ],
          flags: ["over_budget"],
          budgetScope: await this.repository.budgetScope(base, this.policy),
        };
      }
      const failure =
        error instanceof ProviderError
          ? error
          : new ProviderError("provider_error");
      await this.repository.fail(
        base.id,
        failure.code,
        this.clock() - started,
        this.clock(),
      );
      return {
        id: base.id,
        status: "failed",
        outcome: "NEEDS_REVIEW",
        reasons: [
          "Checking automatically. You can check the result in My contributions.",
        ],
        flags: ["failed"],
        errorCode: failure.code,
        retryAfterMs: failure.retryAfterMs,
      };
    }
  }
  private async stage<T>(
    base: DecisionBase,
    stage: "safety" | "evidence",
    provider: string,
    model: string,
    input: unknown,
    reuseMs: number,
    call: (signal: AbortSignal) => Promise<T>,
    timeout: number,
  ): Promise<Stage<T>> {
    const hash = await decisionHash({
      schema: DECISION_SCHEMA_VERSION,
      policy: POLICY_VERSION,
      provider,
      model,
      input,
    });
    const cached = await this.repository.reusableStage(
      provider,
      model,
      stage,
      hash,
      this.clock() - reuseMs,
    );
    if (cached)
      return { provider, model, reused: true, result: JSON.parse(cached) as T };
    const id = await this.repository.reserveStage(
      { ...base, now: this.clock() },
      stage,
      provider,
      model,
      hash,
      this.policy,
    );
    if (!id) throw new ProviderCapacityError();
    const controller = new AbortController(),
      started = this.clock();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        call(controller.signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new ProviderError("timeout"));
          }, timeout);
        }),
      ]);
      await this.repository.finishStage(
        id,
        JSON.stringify(result),
        null,
        this.clock() - started,
      );
      return { provider, model, reused: false, result };
    } catch (error) {
      await this.repository.finishStage(
        id,
        null,
        error instanceof ProviderError ? error.code : "provider_error",
        this.clock() - started,
      );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
