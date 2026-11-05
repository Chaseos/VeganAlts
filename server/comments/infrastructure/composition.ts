import type { WorkContext } from "../../moderation/domain/work";
import { v7 as uuid } from "uuid";
import { CommentService } from "../application/comment-service";
import { DEFAULT_COMMENT_POLICY } from "../domain/comments";
import { D1CommentRepository } from "./d1-comment-repository";
import {
  moderationDecisions,
  moderationWork,
  type ModerationEnv,
} from "../../moderation/infrastructure/composition";

export function commentServices(
  env: Omit<ModerationEnv, "APP_ENV"> & { APP_ENV?: string },
  newId: () => string = uuid,
  clock = Date.now,
  context?: WorkContext,
  database: Pick<D1Database, "prepare" | "batch"> = env.DB,
) {
  return new CommentService(
    new D1CommentRepository(database, DEFAULT_COMMENT_POLICY),
    moderationDecisions(
      { ...env, APP_ENV: env.APP_ENV ?? "local" },
      newId,
      clock,
    ),
    DEFAULT_COMMENT_POLICY,
    newId,
    clock,
    moderationWork(env, newId, clock, context),
  );
}

/**
 * For the comments embedded in a public product page only: that page is
 * shared-cacheable and may be minutes stale, so it can use any read replica.
 * Writes and a person's own comment state use `commentServices`.
 */
export const publicCommentService = (
  env: Parameters<typeof commentServices>[0],
) =>
  commentServices(
    env,
    uuid,
    Date.now,
    undefined,
    env.DB.withSession("first-unconstrained"),
  );
