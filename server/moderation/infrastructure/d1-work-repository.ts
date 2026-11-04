import type {
  AutomaticOperation,
  CheckWork,
  CheckWorkRepository,
  WorkContext,
} from "../domain/work";

export class D1ModerationWorkRepository implements CheckWorkRepository {
  constructor(readonly db: D1Database) {}
  async claimRequest(
    user: string,
    operation: AutomaticOperation,
    key: string,
    hash: string,
    token: string,
    now: number,
  ) {
    const result = await this.db
      .prepare(
        `INSERT INTO moderation_request_leases(user_id,operation,idempotency_key,input_hash,token,expires_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id,operation,idempotency_key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at
      WHERE moderation_request_leases.expires_at<=? AND moderation_request_leases.input_hash=excluded.input_hash`,
      )
      .bind(user, operation, key, hash, token, now + 300_000, now)
      .run();
    if (result.meta.changes === 1) return "claimed" as const;
    const prior = await this.db
      .prepare(
        "SELECT input_hash FROM moderation_request_leases WHERE user_id=? AND operation=? AND idempotency_key=?",
      )
      .bind(user, operation, key)
      .first<string>("input_hash");
    return prior === hash ? ("busy" as const) : ("conflict" as const);
  }
  async releaseRequest(
    user: string,
    operation: AutomaticOperation,
    key: string,
    token: string,
  ) {
    await this.db
      .prepare(
        "DELETE FROM moderation_request_leases WHERE user_id=? AND operation=? AND idempotency_key=? AND token=?",
      )
      .bind(user, operation, key, token)
      .run();
  }
  byRequest(user: string, operation: AutomaticOperation, key: string) {
    return this.db
      .prepare(
        "SELECT * FROM moderation_jobs WHERE user_id=? AND operation=? AND idempotency_key=?",
      )
      .bind(user, operation, key)
      .first<CheckWork>();
  }
  async enqueue(work: Parameters<CheckWorkRepository["enqueue"]>[0]) {
    await this.db
      .prepare(
        "INSERT INTO moderation_jobs(id,user_id,operation,idempotency_key,input_hash,payload_data,status,next_attempt_at,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,'checking',?,?,?,?) ON CONFLICT(user_id,operation,idempotency_key) DO NOTHING",
      )
      .bind(
        work.id,
        work.user,
        work.operation,
        work.key,
        work.hash,
        JSON.stringify(work.data),
        work.next,
        work.now + 86_400_000,
        work.now,
        work.now,
      )
      .run();
  }
  async current(context: WorkContext, now: number) {
    return Boolean(
      await this.db
        .prepare(
          "SELECT 1 FROM moderation_jobs WHERE id=? AND token=? AND status='running' AND lease_expires_at>? AND expires_at>?",
        )
        .bind(context.id, context.token, now, now)
        .first(),
    );
  }
  async finish(
    context: WorkContext,
    status: CheckWork["status"],
    result: unknown,
    error: string | null,
    now: number,
  ) {
    const r = await this.db
      .prepare(
        "UPDATE moderation_jobs SET status=?,result_data=?,error_code=?,token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND token=? AND status='running' AND lease_expires_at>?",
      )
      .bind(
        status,
        result === undefined ? null : JSON.stringify(result),
        error,
        now,
        context.id,
        context.token,
        now,
      )
      .run();
    return r.meta.changes === 1;
  }
  async list(user: string) {
    return (
      await this.db
        .prepare(
          "SELECT * FROM moderation_jobs WHERE user_id=? AND status<>'completed' ORDER BY created_at DESC LIMIT 20",
        )
        .bind(user)
        .all<CheckWork>()
    ).results;
  }
  async due(now: number) {
    await this.db
      .prepare("DELETE FROM moderation_request_leases WHERE expires_at<=?")
      .bind(now)
      .run();
    await this.db
      .prepare(
        "UPDATE moderation_jobs SET status='retry_required',token=NULL,lease_expires_at=NULL,updated_at=? WHERE status IN ('checking','running') AND (expires_at<=? OR (attempts>=3 AND (status='checking' OR lease_expires_at<=?)))",
      )
      .bind(now, now, now)
      .run();
    return (
      await this.db
        .prepare(
          "SELECT * FROM moderation_jobs WHERE attempts<3 AND expires_at>? AND ((status='checking' AND next_attempt_at<=?) OR (status='running' AND lease_expires_at<=?)) ORDER BY next_attempt_at,id LIMIT 20",
        )
        .bind(now, now, now)
        .all<CheckWork>()
    ).results;
  }
  async claim(id: string, token: string, now: number) {
    return (
      (
        await this.db
          .prepare(
            "UPDATE moderation_jobs SET status='running',token=?,lease_expires_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND attempts<3 AND expires_at>? AND ((status='checking' AND next_attempt_at<=?) OR (status='running' AND lease_expires_at<=?))",
          )
          .bind(token, now + 300_000, now, id, now, now, now)
          .run()
      ).meta.changes === 1
    );
  }
  async retry(
    work: CheckWork,
    context: WorkContext,
    delay: number,
    error: string,
    now: number,
    budgetDenied = false,
  ) {
    const attempts = work.attempts + 1;
    const next = Math.max(
      work.created_at +
        ([3_600_000, 10_800_000, 21_600_000][attempts] ?? 21_600_000),
      now + Math.max(60_000, delay),
    );
    await this.db
      .prepare(
        "UPDATE moderation_jobs SET status=?,attempts=attempts-?,next_attempt_at=?,error_code=?,token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND token=? AND status='running'",
      )
      .bind(
        (!budgetDenied && attempts >= 3) || next >= work.expires_at
          ? "retry_required"
          : "checking",
        budgetDenied ? 1 : 0,
        next,
        error,
        now,
        context.id,
        context.token,
      )
      .run();
  }
}
