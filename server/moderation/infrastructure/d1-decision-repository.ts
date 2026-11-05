import type {
  DecisionBase,
  DecisionRepository,
  DecisionRow,
  DecisionVersions,
} from "../application/repository";
import type { Outcome, SubjectType } from "../domain/decisions";
import type { ModerationPolicy } from "../domain/policy";

const DAY = 86_400_000;
const COLUMNS =
  "id,subject_type,subject_id,kind,schema_version,policy_version,provider,model,input_hash,user_id";
const values = (base: DecisionBase) => [
  base.id,
  base.subject.type,
  base.subject.id,
  base.kind,
  base.schemaVersion,
  base.policyVersion,
  base.provider,
  base.model,
  base.inputHash,
  base.userId,
];

export class D1DecisionRepository implements DecisionRepository {
  constructor(private readonly db: D1Database) {}

  async restrict(id: string, outcome: Outcome, resultData: string) {
    await this.db
      .prepare(
        "UPDATE moderation_decisions SET outcome=?,result_data=? WHERE id=? AND status IN ('completed','reused') AND outcome<>'BLOCKED'",
      )
      .bind(outcome, resultData, id)
      .run();
  }
  async budgetScope(base: DecisionBase, policy: ModerationPolicy) {
    const day = Math.floor(base.now / DAY) * DAY;
    const row = await this.db
      .prepare(
        "SELECT SUM(CASE WHEN user_id=? THEN 1 ELSE 0 END) AS account,COUNT(*) AS total FROM moderation_decisions WHERE charged=1 AND created_at>=?",
      )
      .bind(base.userId, day)
      .first<{ account: number; total: number }>();
    return row && row.account >= policy.accountDaily
      ? ("account" as const)
      : row && row.total >= policy.daily
        ? ("environment" as const)
        : ("busy" as const);
  }
  async reusableStage(
    provider: string,
    model: string,
    stage: string,
    hash: string,
    since: number,
  ) {
    return this.db
      .prepare(
        "SELECT result_data FROM moderation_provider_attempts WHERE provider=? AND model=? AND stage=? AND input_hash=? AND status='completed' AND created_at>=? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(provider, model, stage, hash, since)
      .first<string>("result_data");
  }
  async reserveStage(
    base: DecisionBase,
    stage: "safety" | "evidence",
    provider: string,
    model: string,
    hash: string,
    policy: ModerationPolicy,
  ) {
    const id = crypto.randomUUID(),
      day = Math.floor(base.now / DAY) * DAY;
    await this.db
      .prepare(
        "UPDATE moderation_provider_attempts SET status='failed',error_code='timeout',lease_expires_at=NULL WHERE status='reserved' AND lease_expires_at<=?",
      )
      .bind(base.now)
      .run();
    const result = await this.db
      .prepare(
        `INSERT INTO moderation_provider_attempts(id,decision_id,user_id,provider,model,stage,input_hash,status,created_at,lease_expires_at)
      SELECT ?,?,?,?,?,?,?,'reserved',?,? WHERE
      (SELECT COUNT(*) FROM moderation_provider_attempts WHERE provider=? AND created_at>=?) < ? AND
      (SELECT COUNT(*) FROM moderation_provider_attempts WHERE provider=? AND user_id=? AND created_at>=?) < ? AND
      (SELECT COUNT(*) FROM moderation_provider_attempts WHERE status='reserved' AND lease_expires_at>?) < ? AND
      (SELECT COUNT(*) FROM moderation_provider_attempts WHERE status='reserved' AND user_id=? AND lease_expires_at>?) < ? AND
      NOT EXISTS(SELECT 1 FROM moderation_provider_attempts WHERE provider=? AND model=? AND stage=? AND input_hash=? AND status='reserved')`,
      )
      .bind(
        id,
        base.id,
        base.userId,
        provider,
        model,
        stage,
        hash,
        base.now,
        base.now + policy.leaseMs,
        provider,
        day,
        policy.daily,
        provider,
        base.userId,
        day,
        policy.accountDaily,
        base.now,
        policy.globalConcurrent,
        base.userId,
        base.now,
        policy.concurrent,
        provider,
        model,
        stage,
        hash,
      )
      .run();
    return result.meta.changes === 1 ? id : null;
  }
  async finishStage(
    id: string,
    data: string | null,
    error: string | null,
    latency: number,
  ) {
    await this.db
      .prepare(
        "UPDATE moderation_provider_attempts SET status=?,result_data=?,error_code=?,latency_ms=?,lease_expires_at=NULL WHERE id=? AND status='reserved'",
      )
      .bind(error ? "failed" : "completed", data, error, latency, id)
      .run();
  }

  async reusable(versions: DecisionVersions, inputHash: string, since: number) {
    return this.db
      .prepare(
        `SELECT * FROM moderation_decisions WHERE status='completed' AND kind=? AND schema_version=? AND policy_version=? AND model=? AND input_hash=? AND created_at>=? ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(
        versions.kind,
        versions.schemaVersion,
        versions.policyVersion,
        versions.model,
        inputHash,
        since,
      )
      .first<DecisionRow & { outcome: Outcome; result_data: string }>();
  }
  async recordReused(base: DecisionBase, priorId: string, outcome: Outcome) {
    await this.db
      .prepare(
        `INSERT INTO moderation_decisions(${COLUMNS},status,outcome,charged,result_data,reused_from,created_at,completed_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,'reused',?,0,result_data,id,?,? FROM moderation_decisions WHERE id=?`,
      )
      .bind(...values(base), outcome, base.now, base.now, priorId)
      .run();
  }
  /**
   * One conditional insert enforces the environment budget, the account's
   * share and its concurrent evaluations, so racing requests cannot overspend.
   */
  async reserve(base: DecisionBase, policy: ModerationPolicy) {
    const day = Math.floor(base.now / DAY) * DAY;
    const result = await this.db
      .prepare(
        `INSERT INTO moderation_decisions(${COLUMNS},status,charged,lease_expires_at,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,'reserved',1,?,?
        WHERE (SELECT COUNT(*) FROM moderation_decisions WHERE charged=1 AND created_at>=?) < ?
        AND (SELECT COUNT(*) FROM moderation_decisions WHERE charged=1 AND user_id=? AND created_at>=?) < ?
        AND (SELECT COUNT(*) FROM moderation_decisions WHERE status='reserved' AND user_id=? AND lease_expires_at>?) < ?
        AND (SELECT COUNT(*) FROM moderation_decisions WHERE status='reserved' AND lease_expires_at>?) < ?`,
      )
      .bind(
        ...values(base),
        base.now + policy.leaseMs,
        base.now,
        day,
        policy.daily,
        base.userId,
        day,
        policy.accountDaily,
        base.userId,
        base.now,
        policy.concurrent,
        base.now,
        policy.globalConcurrent,
      )
      .run();
    return result.meta.changes === 1;
  }
  async recordOverBudget(base: DecisionBase) {
    await this.db
      .prepare(
        `INSERT INTO moderation_decisions(${COLUMNS},status,outcome,charged,error_code,created_at,completed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,'over_budget','NEEDS_REVIEW',0,'over_budget',?,?)`,
      )
      .bind(...values(base), base.now, base.now)
      .run();
    return base.id;
  }
  async complete(
    id: string,
    result: {
      outcome: Outcome;
      resultData: string;
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
      now: number;
    },
  ) {
    const update = await this.db
      .prepare(
        "UPDATE moderation_decisions SET status='completed',outcome=?,result_data=?,input_tokens=?,output_tokens=?,latency_ms=?,completed_at=?,lease_expires_at=NULL WHERE id=? AND status='reserved'",
      )
      .bind(
        result.outcome,
        result.resultData,
        result.inputTokens,
        result.outputTokens,
        result.latencyMs,
        result.now,
        id,
      )
      .run();
    return update.meta.changes === 1;
  }
  async fail(id: string, code: string, latencyMs: number, now: number) {
    await this.db
      .prepare(
        "UPDATE moderation_decisions SET status='failed',outcome='NEEDS_REVIEW',error_code=?,latency_ms=?,completed_at=?,lease_expires_at=NULL WHERE id=? AND status='reserved'",
      )
      .bind(code, latencyMs, now, id)
      .run();
  }
  latest(type: SubjectType, id: string) {
    return this.db
      .prepare(
        "SELECT * FROM moderation_decisions WHERE subject_type=? AND subject_id=? AND status<>'reserved' ORDER BY created_at DESC, id DESC LIMIT 1",
      )
      .bind(type, id)
      .first<DecisionRow>();
  }
  async expireLeases(now: number) {
    const result = await this.db
      .prepare(
        "UPDATE moderation_decisions SET status='failed',outcome='NEEDS_REVIEW',error_code='lease_expired',completed_at=?,lease_expires_at=NULL WHERE id IN (SELECT id FROM moderation_decisions WHERE status='reserved' AND lease_expires_at<=? LIMIT 100)",
      )
      .bind(now, now)
      .run();
    return result.meta.changes;
  }
}
