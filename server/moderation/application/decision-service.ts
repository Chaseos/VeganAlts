import {
  DECISION_SCHEMA_VERSION,
  MODEL_TIER,
  questionsFor,
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
import type { DecisionRepository } from "./repository";

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
/** Provider-neutral port. Domain and contribution code never see vendor shapes. */
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
      | "input_too_large",
    message = code,
  ) {
    super(message);
  }
}

export interface DecisionRequest {
  kind: DecisionKind;
  subject: { type: SubjectType; id: string };
  /** The account charged for the evaluation. */
  userId: string;
  state: Record<string, unknown>;
  images?: DecisionImage[];
  context?: PolicyContext;
}
export interface DecisionResult {
  id: string | null;
  status: "disabled" | "completed" | "reused" | "failed" | "over_budget";
  /** Null only when the provider is deliberately disabled. */
  outcome: Outcome | null;
  reasons: string[];
  flags: string[];
}
interface StoredResult {
  answers: Answers;
  reasons: string[];
  flags: string[];
}

const UNAVAILABLE = [
  "An automated check was unavailable, so a moderator will review this.",
];

function stable(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFKC");
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
async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Runs an automated decision after the caller's deterministic checks. Budget
 * is reserved atomically before any provider call; identical recent payloads
 * reuse an earlier answer; every failure degrades to NEEDS_REVIEW.
 */
export class ModerationDecisionService {
  constructor(
    private readonly repository: DecisionRepository,
    private readonly provider: ModerationProvider | null,
    private readonly policy: ModerationPolicy,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}
  get enabled() {
    return this.provider !== null;
  }
  latest(type: SubjectType, id: string) {
    return this.repository.latest(type, id);
  }
  expireLeases() {
    return this.repository.expireLeases(this.clock());
  }
  async evaluate(request: DecisionRequest): Promise<DecisionResult> {
    const provider = this.provider;
    if (!provider)
      return {
        id: null,
        status: "disabled",
        outcome: null,
        reasons: [],
        flags: [],
      };
    const images = request.images ?? [];
    const tier = MODEL_TIER[request.kind],
      model = provider.model(tier),
      questions = questionsFor(request.kind, images.length);
    const versions = {
      kind: request.kind,
      schemaVersion: DECISION_SCHEMA_VERSION,
      policyVersion: POLICY_VERSION,
      model,
    };
    const inputHash = await sha256({
      ...versions,
      state: stable(request.state),
      images: images.map((i) => i.contentHash),
      context: stable(request.context ?? {}),
    });
    const now = this.clock(),
      base = {
        ...versions,
        id: this.newId(),
        subject: request.subject,
        provider: provider.name,
        inputHash,
        userId: request.userId,
        now,
      };
    const prior = await this.repository.reusable(
      versions,
      inputHash,
      now - reuseWindow(this.policy),
    );
    if (prior) {
      await this.repository.recordReused(base, prior.id, prior.outcome);
      const stored = JSON.parse(prior.result_data) as StoredResult;
      return {
        id: base.id,
        status: "reused",
        outcome: prior.outcome,
        reasons: stored.reasons,
        flags: stored.flags,
      };
    }
    if (!(await this.repository.reserve(base, this.policy)))
      return this.unavailable(
        await this.repository.recordOverBudget(base),
        "over_budget",
      );
    const started = this.clock();
    try {
      const result = await this.withTimeout(
        provider.decide({ tier, state: request.state, questions, images }),
      );
      for (const question of questions)
        if (!result.answers[question.id])
          throw new ProviderError("invalid_response");
      const policy = evaluatePolicy(
        request.kind,
        result.answers,
        request.context ?? {},
        this.policy,
      );
      const stored: StoredResult = {
        answers: result.answers,
        reasons: policy.reasons,
        flags: policy.flags,
      };
      if (
        !(await this.repository.complete(base.id, {
          outcome: policy.outcome,
          resultData: JSON.stringify(stored),
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          latencyMs: this.clock() - started,
          now: this.clock(),
        }))
      )
        // The lease expired and the cron already recorded a failure.
        return this.unavailable(base.id, "failed");
      return { id: base.id, status: "completed", ...policy };
    } catch (error) {
      const code =
        error instanceof ProviderError ? error.code : "provider_error";
      await this.repository.fail(
        base.id,
        code,
        this.clock() - started,
        this.clock(),
      );
      return this.unavailable(base.id, "failed");
    }
  }
  private unavailable(
    id: string,
    status: "failed" | "over_budget",
  ): DecisionResult {
    return {
      id,
      status,
      outcome: "NEEDS_REVIEW",
      reasons: UNAVAILABLE,
      flags: [status],
    };
  }
  private async withTimeout<T>(work: Promise<T>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new ProviderError("timeout")),
            this.policy.timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
