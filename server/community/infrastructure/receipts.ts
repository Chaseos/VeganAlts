import { ApplicationError } from "../../shared/domain/errors";
import { fingerprint } from "../domain/policy";

export interface ReceiptWrite {
  userId: string;
  operation: string;
  key: string;
  hash: string;
  now: number;
}
export async function receiptWrite(
  userId: string,
  operation: string,
  key: string,
  input: unknown,
  now: number,
): Promise<ReceiptWrite> {
  return { userId, operation, key, hash: await fingerprint(input), now };
}
export async function replay<T>(
  db: D1Database,
  receipt: ReceiptWrite,
): Promise<T | null> {
  const row = await db
    .prepare(
      "SELECT input_hash,result_data FROM contribution_receipts WHERE user_id=? AND operation=? AND idempotency_key=?",
    )
    .bind(receipt.userId, receipt.operation, receipt.key)
    .first<{ input_hash: string; result_data: string }>();
  if (!row) return null;
  if (row.input_hash !== receipt.hash)
    throw new ApplicationError(
      "IDEMPOTENCY_CONFLICT",
      "This request key belongs to different content. Refresh and try again.",
      409,
    );
  return JSON.parse(row.result_data) as T;
}
export function receiptStatement(
  db: D1Database,
  receipt: ReceiptWrite,
  result: unknown,
) {
  return db
    .prepare(
      "INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      receipt.userId,
      receipt.operation,
      receipt.key,
      receipt.hash,
      JSON.stringify(result),
      receipt.now,
    );
}
export async function commitReceipt<T>(
  db: D1Database,
  statements: D1PreparedStatement[],
  receipt: ReceiptWrite,
  result: T,
) {
  try {
    await db.batch([...statements, receiptStatement(db, receipt, result)]);
    return result;
  } catch (error) {
    // A concurrent retry's unique receipt rolls back this entire batch.
    const saved = await replay<T>(db, receipt);
    if (saved) return saved;
    throw error;
  }
}
