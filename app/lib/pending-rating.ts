import { isRatingSelection } from "../../server/ratings/domain/selection";
import { safeReturnDestination } from "../../server/auth/domain/return-destination";

const KEY = "veganalts.pending-rating.v1";
export const PENDING_RATING_TTL = 30 * 60 * 1000;
export interface PendingRating {
  id: string;
  productVersionId: string;
  categoryId: string;
  overallSimilarity: number;
  createdAt: number;
  returnTo: string;
}

export function readPendingRating(
  storage: Pick<Storage, "getItem" | "removeItem">,
  origin: string,
  now = Date.now(),
): PendingRating | null {
  try {
    const value = JSON.parse(
      storage.getItem(KEY) ?? "null",
    ) as Partial<PendingRating> | null;
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.createdAt !== "number" ||
      !Number.isFinite(value.createdAt) ||
      value.createdAt > now ||
      now - value.createdAt > PENDING_RATING_TTL ||
      typeof value.returnTo !== "string" ||
      safeReturnDestination(value.returnTo, origin, "") !== value.returnTo ||
      !isRatingSelection(value)
    ) {
      storage.removeItem(KEY);
      return null;
    }
    return value as PendingRating;
  } catch {
    return null;
  }
}
export function storePendingRating(
  storage: Pick<Storage, "setItem">,
  value: PendingRating,
) {
  storage.setItem(KEY, JSON.stringify(value));
}
export function clearPendingRating(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(KEY);
}
