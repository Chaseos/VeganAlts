import { z } from "zod";
import { ApplicationError } from "../../shared/domain/errors";
import { wilsonInterval } from "../../shared/domain/statistics";

const DAY = 86_400_000;
export const COMMENT_PAGE = 20;
export const DEFAULT_COMMENT_POLICY = {
  minLength: 2,
  maxLength: 2000,
  perDay: 30,
  collapseDownvotes: 5,
  collapseUpperBound: 0.4,
  reevaluatePerPass: 20,
};
export type CommentPolicy = typeof DEFAULT_COMMENT_POLICY;
export const commentDay = (now: number) => Math.floor(now / DAY) * DAY;

/** Plain text only: normalize line endings, trim and collapse blank runs. */
export function normalizeBody(value: string) {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const body = z
  .string()
  .max(DEFAULT_COMMENT_POLICY.maxLength * 2)
  .transform(normalizeBody)
  .refine(
    (v) =>
      v.length >= DEFAULT_COMMENT_POLICY.minLength &&
      v.length <= DEFAULT_COMMENT_POLICY.maxLength,
    `Write between ${DEFAULT_COMMENT_POLICY.minLength} and ${DEFAULT_COMMENT_POLICY.maxLength} characters.`,
  );
export const commentInput = z
  .object({ productId: id, body, categoryId: id.optional() })
  .strict();
export const commentEdit = z
  .object({ body, expectedUpdatedAt: z.number().int().nonnegative() })
  .strict();
export const commentVote = z
  .object({ value: z.union([z.literal(1), z.literal(-1), z.literal(0)]) })
  .strict();
export const commentSort = z.enum(["best", "newest"]);
export const commentFormula = z.enum(["current", "earlier"]);
export type CommentInput = z.infer<typeof commentInput>;
export type CommentSort = z.infer<typeof commentSort>;
export type CommentFormula = z.infer<typeof commentFormula>;
export type CommentState = "pending" | "visible" | "hidden" | "removed";

/** Best ordering: confidence that a comment is useful, not raw net votes. */
export function bestRank(up: number, down: number) {
  return Math.floor(wilsonInterval(up, up + down).lower * 1e9);
}
/** Collapsed comments stay available behind an explicit Show action. */
export function isCollapsed(
  up: number,
  down: number,
  policy: Pick<CommentPolicy, "collapseDownvotes" | "collapseUpperBound">,
) {
  return (
    down >= policy.collapseDownvotes &&
    wilsonInterval(up, up + down).upper < policy.collapseUpperBound
  );
}
export function applyVote(
  counts: { up: number; down: number },
  previous: -1 | 1 | null,
  next: -1 | 0 | 1,
) {
  let { up, down } = counts;
  if (previous === 1) up--;
  if (previous === -1) down--;
  if (next === 1) up++;
  if (next === -1) down++;
  return { up: Math.max(0, up), down: Math.max(0, down) };
}

type Cursor =
  | { sort: "best"; rank: number; createdAt: number; id: string }
  | { sort: "newest"; createdAt: number; id: string };
export function encodeCommentCursor(cursor: Cursor) {
  return btoa(
    JSON.stringify(
      cursor.sort === "best"
        ? ["b", cursor.rank, cursor.createdAt, cursor.id]
        : ["n", cursor.createdAt, cursor.id],
    ),
  );
}
export function decodeCommentCursor(
  value: string | null,
  sort: CommentSort,
): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 300) throw new Error();
    const tuple: unknown = JSON.parse(atob(value));
    if (!Array.isArray(tuple)) throw new Error();
    const valid = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
    const validId = (v: unknown) =>
      typeof v === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
    if (
      sort === "best" &&
      tuple[0] === "b" &&
      tuple.length === 4 &&
      valid(tuple[1]) &&
      valid(tuple[2]) &&
      validId(tuple[3])
    )
      return {
        sort,
        rank: tuple[1] as number,
        createdAt: tuple[2] as number,
        id: tuple[3] as string,
      };
    if (
      sort === "newest" &&
      tuple[0] === "n" &&
      tuple.length === 3 &&
      valid(tuple[1]) &&
      validId(tuple[2])
    )
      return { sort, createdAt: tuple[1] as number, id: tuple[2] as string };
    throw new Error();
  } catch {
    throw new ApplicationError("INVALID_CURSOR", "This page link is invalid.");
  }
}
