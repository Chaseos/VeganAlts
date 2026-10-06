import { z } from "zod";
import { ApplicationError } from "../../shared/domain/errors";
import {
  recordId,
  type PersonalRatingsRepository,
  type RatingCursor,
} from "../domain/contracts";

const cursorSchema = z
  .object({
    updatedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    id: recordId,
  })
  .strict();
export function decodeRatingCursor(input: string | null): RatingCursor | null {
  if (input === null) return null;
  try {
    if (input.length > 250 || !/^[A-Za-z0-9_-]+$/.test(input))
      throw new Error();
    return cursorSchema.parse(
      JSON.parse(atob(input.replaceAll("-", "+").replaceAll("_", "/"))),
    );
  } catch {
    throw new ApplicationError(
      "INVALID_CURSOR",
      "This page link has expired. Open My Ratings again.",
    );
  }
}
export const encodeRatingCursor = (cursor: RatingCursor) =>
  btoa(JSON.stringify(cursor))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

export class PersonalRatingsService {
  constructor(private readonly repository: PersonalRatingsRepository) {}
  state(userId: string | null, input: string) {
    const values = input ? [...new Set(input.split(","))] : [];
    if (
      input.length > 1480 ||
      values.length > 40 ||
      values.some((id) => !recordId.safeParse(id).success)
    )
      throw new ApplicationError(
        "INVALID_VERSIONS",
        "Request up to 40 valid formula IDs.",
      );
    return userId
      ? this.repository.state(userId, values)
      : Promise.resolve({ ratings: [], triedVersionIds: [] });
  }
  async list(userId: string, input: string | null) {
    const items = await this.repository.list(
      userId,
      decodeRatingCursor(input),
      21,
    );
    const page = items.slice(0, 20);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor:
        items.length > 20 && last
          ? encodeRatingCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
    };
  }
}
