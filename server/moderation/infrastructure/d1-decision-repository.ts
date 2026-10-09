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
        AND (SELECT COUNT(*) FROM moderation_decisions WHERE status='reserved' AND user_id=? AND lease_expires_at>?) < ?`,
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
