import { ApplicationError } from "../../shared/domain/errors";
import { decisionHash, type DecisionResult } from "./decision-service";
import type {
  AutomaticOperation,
  CheckWork,
  CheckWorkRepository,
  WorkContext,
} from "../domain/work";

export class CheckUnavailable extends Error {
  constructor(readonly retryAfterMs = 0) {
    super("Automated check unavailable");
  }
}
export class AutomaticCheckPending extends ApplicationError {
  constructor(readonly work: Pick<CheckWork, "id" | "status">) {
    super(
      work.status === "checking" || work.status === "running"
        ? "CHECKING_AUTOMATICALLY"
        : "CHECK_RESUBMIT_REQUIRED",
      work.status === "checking" || work.status === "running"
        ? "Checking automatically. You can leave this page and check My contributions for the result."
        : "Please resubmit this contribution. The automatic checks could not finish.",
      503,
      60,
      {
        check: {
          id: work.id,
          state: work.status === "running" ? "checking" : work.status,
        },
      },
    );
  }
}
/** Call before any canonical write; quota denials never enter the retry queue. */
export function requireAutomatedCheck(result: DecisionResult) {
  if (result.status === "over_budget")
    throw new ApplicationError(
      result.budgetScope === "account"
        ? "MODERATION_ACCOUNT_LIMIT"
        : "MODERATION_CAPACITY",
      "The automated check allowance is exhausted. Please try again later.",
      result.budgetScope === "account" ? 429 : 503,
      Math.ceil((result.retryAfterMs ?? 60_000) / 1000),
    );
  if (result.status === "failed") {
    if (
      ["not_configured", "input_too_large", "invalid_response"].includes(
        result.errorCode ?? "",
      )
    )
      throw new ApplicationError(
        "MODERATION_UNAVAILABLE",
        "The automatic check could not finish. Please try again later.",
        503,
      );
    throw new CheckUnavailable(result.retryAfterMs);
  }
}

/** A deferred payload is private canonical work, separate from the review inbox. */
export class ModerationWorkService {
  constructor(
    private readonly repository: CheckWorkRepository,
    private readonly newId: () => string,
    private readonly clock = Date.now,
    readonly context?: WorkContext,
  ) {}
  async execute<T>(
    user: string,
    operation: AutomaticOperation,
    key: string,
    data: unknown,
    perform: () => Promise<T>,
  ): Promise<T> {
    const now = this.clock(),
      hash = await decisionHash(data);
    const prior = await this.repository.byRequest(user, operation, key);
    if (prior && prior.input_hash !== hash)
      throw new ApplicationError(
        "IDEMPOTENCY_CONFLICT",
        "This request key belongs to different content.",
        409,
      );
    if (prior?.status === "completed")
      return JSON.parse(prior.result_data!) as T;
    if (prior?.status === "blocked")
      throw new ApplicationError(
        "CONTRIBUTION_BLOCKED",
        "This contribution was rejected. Revise it before submitting again.",
        422,
      );
    const resuming = prior && this.context?.id === prior.id;
    if (prior && !resuming) throw new AutomaticCheckPending(prior);
    if (resuming) await this.assertCurrent();
    const requestToken = this.newId();
    const claim = await this.repository.claimRequest(
      user,
      operation,
      key,
      hash,
      requestToken,
      now,
    );
    if (claim !== "claimed")
      throw new ApplicationError(
        claim === "conflict" ? "IDEMPOTENCY_CONFLICT" : "CHECK_IN_PROGRESS",
        claim === "conflict"
          ? "This request key belongs to different content."
          : "This contribution is already being checked. Please wait a moment and retry.",
        claim === "conflict" ? 409 : 503,
        60,
      );
    try {
      const result = await perform();
      if (resuming)
        await this.repository.finish(
          this.context!,
          result &&
            typeof result === "object" &&
            "decision" in result &&
            result.decision === "BLOCKED"
            ? "blocked"
            : "completed",
          result,
          null,
          this.clock(),
        );
      return result;
    } catch (error) {
      if (error instanceof CheckUnavailable && !resuming) {
        const id = this.newId();
        await this.repository.enqueue({
          id,
          user,
          operation,
          key,
          hash,
          data,
          now,
          next: now + Math.max(3_600_000, error.retryAfterMs),
        });
        const queued = (await this.repository.byRequest(user, operation, key))!;
        if (queued.input_hash !== hash)
          throw new ApplicationError(
            "IDEMPOTENCY_CONFLICT",
            "This request key belongs to different content.",
            409,
          );
        throw new AutomaticCheckPending(queued);
      }
      throw error;
    } finally {
      await this.repository.releaseRequest(user, operation, key, requestToken);
    }
  }
  async assertCurrent() {
    if (
      this.context &&
      !(await this.repository.current(this.context, this.clock()))
    )
      throw new ApplicationError(
        "CHECK_CHANGED",
        "This automatic check was replaced or expired. Please resubmit.",
        409,
      );
  }
  async list(user: string) {
    return (await this.repository.list(user)).map((row) => ({
      id: row.id,
      operation: row.operation,
      status: row.status === "running" ? "checking" : row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      errorCode: row.error_code,
    }));
  }
}
