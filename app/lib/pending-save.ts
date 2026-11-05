import { isRecordId } from "../../server/ratings/domain/selection";

// A save tapped while signed out, finished when sign-in returns to this tab.
const KEY = "veganalts.pending-save.v1";
export const PENDING_SAVE_TTL = 30 * 60 * 1000;

export function storePendingSave(
  storage: Pick<Storage, "setItem">,
  productId: string,
  now = Date.now(),
) {
  storage.setItem(KEY, JSON.stringify({ productId, createdAt: now }));
}

export function clearPendingSave(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(KEY);
}

export function readPendingSave(
  storage: Pick<Storage, "getItem" | "removeItem">,
  now = Date.now(),
): string | null {
  try {
    const value = JSON.parse(storage.getItem(KEY) ?? "null") as {
      productId?: unknown;
      createdAt?: unknown;
    } | null;
    if (!value) return null;
    if (
      isRecordId(value.productId) &&
      typeof value.createdAt === "number" &&
      value.createdAt <= now &&
      now - value.createdAt <= PENDING_SAVE_TTL
    )
      return value.productId;
  } catch {
    /* A malformed entry is removed below. */
  }
  clearPendingSave(storage);
  return null;
}
