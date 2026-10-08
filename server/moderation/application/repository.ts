import type { DecisionKind, Outcome, SubjectType } from "../domain/decisions";
import type { ModerationPolicy } from "../domain/policy";

export interface DecisionVersions {
  kind: DecisionKind;
  schemaVersion: number;
  policyVersion: number;
  model: string;
}
export interface DecisionBase extends DecisionVersions {
  id: string;
  subject: { type: SubjectType; id: string };
  provider: string;
  inputHash: string;
  userId: string;
  now: number;
}
export interface DecisionRow {
  id: string;
  subject_type: SubjectType;
  subject_id: string;
  kind: DecisionKind;
  provider: string;
  model: string;
  status: "reserved" | "completed" | "reused" | "failed" | "over_budget";
  outcome: Outcome | null;
  result_data: string | null;
  error_code: string | null;
  created_at: number;
}
export interface DecisionRepository {
  reusable(
    versions: DecisionVersions,
    inputHash: string,
    since: number,
  ): Promise<(DecisionRow & { outcome: Outcome; result_data: string }) | null>;
  recordReused(
    base: DecisionBase,
    priorId: string,
    outcome: Outcome,
  ): Promise<void>;
  reserve(base: DecisionBase, policy: ModerationPolicy): Promise<boolean>;
  recordOverBudget(base: DecisionBase): Promise<string>;
  complete(
    id: string,
    result: {
      outcome: Outcome;
      resultData: string;
      inputTokens: number;
      outputTokens: number;
      latencyMs: number;
      now: number;
    },
  ): Promise<boolean>;
  fail(id: string, code: string, latencyMs: number, now: number): Promise<void>;
  latest(type: SubjectType, id: string): Promise<DecisionRow | null>;
  expireLeases(now: number): Promise<number>;
}
