export const automaticOperations = [
  "submission_finalize",
  "comment_create",
  "comment_edit",
  "proposal_create",
  "proposal_response",
  "retailer_proposal",
  "category_proposal",
] as const;
export type AutomaticOperation = (typeof automaticOperations)[number];
export interface CheckWork {
  id: string;
  user_id: string;
  operation: AutomaticOperation;
  idempotency_key: string;
  input_hash: string;
  payload_data: string;
  status: "checking" | "running" | "completed" | "blocked" | "retry_required";
  attempts: number;
  next_attempt_at: number;
  expires_at: number;
  token: string | null;
  lease_expires_at: number | null;
  result_data: string | null;
  error_code: string | null;
  created_at: number;
  updated_at: number;
}
export interface WorkContext {
  id: string;
  token: string;
}
export interface CheckWorkRepository {
  claimRequest(
    user: string,
    operation: AutomaticOperation,
    key: string,
    hash: string,
    token: string,
    now: number,
  ): Promise<"claimed" | "busy" | "conflict">;
  releaseRequest(
    user: string,
    operation: AutomaticOperation,
    key: string,
    token: string,
  ): Promise<void>;
  byRequest(
    user: string,
    operation: AutomaticOperation,
    key: string,
  ): Promise<CheckWork | null>;
  enqueue(work: {
    id: string;
    user: string;
    operation: AutomaticOperation;
    key: string;
    hash: string;
    data: unknown;
    now: number;
    next: number;
  }): Promise<void>;
  current(context: WorkContext, now: number): Promise<boolean>;
  finish(
    context: WorkContext,
    status: CheckWork["status"],
    result: unknown,
    error: string | null,
    now: number,
  ): Promise<boolean>;
  list(user: string): Promise<CheckWork[]>;
}
