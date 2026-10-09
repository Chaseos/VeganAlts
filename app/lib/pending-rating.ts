import { isRatingSelection } from "../../server/ratings/domain/selection";
import {
  MAX_DIMENSIONS,
  isConventionalRecency,
  isDimensionKey,
  type ConventionalRecency,
} from "../../server/ratings/domain/details";
import { safeReturnDestination } from "../../server/auth/domain/return-destination";

// v2 adds the detail answers and "last ate"; a v1 selection (score only) from
// before an upgrade is still honored.
const KEY = "veganalts.pending-rating.v2";
const LEGACY_KEY = "veganalts.pending-rating.v1";
export const PENDING_RATING_TTL = 30 * 60 * 1000;
export interface PendingRating {
  id: string;
  productVersionId: string;
  categoryId: string;
  overallSimilarity: number;
  dimensions?: Record<string, number | null>;
  conventionalRecency?: ConventionalRecency | null;
  createdAt: number;
  returnTo: string;
}

const validDetails = (value: Partial<PendingRating>) =>
  (value.dimensions === undefined ||
    (typeof value.dimensions === "object" &&
      value.dimensions !== null &&
      Object.keys(value.dimensions).length <= MAX_DIMENSIONS &&
      Object.entries(value.dimensions).every(
        ([key, score]) =>
          isDimensionKey(key) &&
          (score === null ||
            (Number.isInteger(score) && score >= 1 && score <= 5)),
      ))) &&
  (value.conventionalRecency === undefined ||
    value.conventionalRecency === null ||
    isConventionalRecency(value.conventionalRecency));

export function readPendingRating(
  storage: Pick<Storage, "getItem" | "removeItem">,
  origin: string,
  now = Date.now(),
): PendingRating | null {
  try {
    const stored = storage.getItem(KEY) ?? storage.getItem(LEGACY_KEY);
    const value = JSON.parse(stored ?? "null") as Partial<PendingRating> | null;
    if (
      !value ||
      typeof value.id !== "string" ||
      typeof value.createdAt !== "number" ||
      !Number.isFinite(value.createdAt) ||
      value.createdAt > now ||
      now - value.createdAt > PENDING_RATING_TTL ||
      typeof value.returnTo !== "string" ||
      safeReturnDestination(value.returnTo, origin, "") !== value.returnTo ||
      !isRatingSelection(value) ||
      !validDetails(value)
    ) {
      clearPendingRating(storage);
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
  storage.removeItem(LEGACY_KEY);
}
