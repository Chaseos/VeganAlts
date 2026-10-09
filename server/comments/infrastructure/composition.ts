import { v7 as uuid } from "uuid";
import { CommentService } from "../application/comment-service";
import { DEFAULT_COMMENT_POLICY } from "../domain/comments";
import { D1CommentRepository } from "./d1-comment-repository";
import {
  moderationDecisions,
  type ModerationEnv,
} from "../../moderation/infrastructure/composition";

export function commentServices(
  env: Omit<ModerationEnv, "APP_ENV"> & { APP_ENV?: string },
  newId: () => string = uuid,
  clock = Date.now,
) {
  return new CommentService(
    new D1CommentRepository(env.DB, DEFAULT_COMMENT_POLICY),
    moderationDecisions(
      { ...env, APP_ENV: env.APP_ENV ?? "local" },
      newId,
      clock,
    ),
    DEFAULT_COMMENT_POLICY,
    newId,
    clock,
  );
}
