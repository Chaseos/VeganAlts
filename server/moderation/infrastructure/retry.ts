import { z } from "zod";
import { ApplicationError } from "../../shared/domain/errors";
import { communityServices } from "../../community/infrastructure/composition";
import { commentServices } from "../../comments/infrastructure/composition";
import { taxonomyServices } from "../../taxonomy/infrastructure/composition";
import { invalidateCommunityProduct } from "../../community/infrastructure/invalidation";
import {
  changeInput,
  id,
  responseInput,
  retailerInput,
  submissionInput,
  type Actor,
} from "../../community/domain/contracts";
import { commentEdit, commentInput } from "../../comments/domain/comments";
import { categoryProposalInput } from "../../taxonomy/domain/taxonomy";
import { CheckUnavailable } from "../application/work-service";
import type { CheckWork, WorkContext } from "../domain/work";
import { D1ModerationWorkRepository } from "./d1-work-repository";

async function dispatch(
  env: Cloudflare.Env,
  work: CheckWork,
  context: WorkContext,
  clock: () => number,
) {
  const profile = await env.DB.prepare(
    "SELECT account_state FROM profiles WHERE user_id=?",
  )
    .bind(work.user_id)
    .first<{ account_state: string }>();
  if (!profile || profile.account_state !== "active")
    throw new ApplicationError(
      "ACCOUNT_RESTRICTED",
      "This account cannot make changes.",
      403,
    );
  const actor: Actor = {
    id: work.user_id,
    accountState: profile.account_state,
    administrator: false,
  };
  const data: unknown = JSON.parse(work.payload_data),
    key = work.idempotency_key,
    newId = () => crypto.randomUUID();
  const community = () => communityServices(env, newId, clock, context);
  switch (work.operation) {
    case "submission_finalize": {
      const value = z
        .object({ receiptId: id, input: submissionInput })
        .strict()
        .parse(data);
      const result = await community().submissions.finalize(
        actor,
        value.receiptId,
        value.input,
      );
      const productId = await env.DB.prepare(
        "SELECT product_id FROM submission_receipts WHERE id=?",
      )
        .bind(value.receiptId)
        .first<string>("product_id");
      if (productId) await invalidateCommunityProduct(env.DB, productId);
      return result;
    }
    case "comment_create":
      return commentServices(env, newId, clock, context).create(
        actor,
        key,
        commentInput.parse(data),
      );
    case "comment_edit": {
      const value = z.object({ id, input: commentEdit }).strict().parse(data);
      return commentServices(env, newId, clock, context).edit(
        actor,
        value.id,
        value.input,
        key,
      );
    }
    case "proposal_create":
      return community().contributions.propose(
        actor,
        key,
        changeInput.parse(data),
      );
    case "proposal_response": {
      const value = z
        .object({ proposalId: id, input: responseInput })
        .strict()
        .parse(data);
      const newer = await env.DB.prepare(
        "SELECT 1 FROM edit_proposal_responses WHERE proposal_id=? AND user_id=? AND updated_at>?",
      )
        .bind(value.proposalId, actor.id, work.created_at)
        .first();
      const committed = await env.DB.prepare(
        "SELECT 1 FROM contribution_receipts WHERE user_id=? AND operation=? AND idempotency_key=?",
      )
        .bind(actor.id, `proposal-response-${value.proposalId}`, key)
        .first();
      if (newer && !committed)
        throw new ApplicationError(
          "RESPONSE_CHANGED",
          "A newer response replaced this check.",
          409,
        );
      return community().contributions.respond(
        actor,
        key,
        value.proposalId,
        value.input,
      );
    }
    case "retailer_proposal":
      return community().contributions.proposeRetailer(
        actor,
        key,
        retailerInput.parse(data),
      );
    case "category_proposal":
      return taxonomyServices(env, newId, clock, context).propose(
        actor,
        key,
        categoryProposalInput.parse(data),
      );
  }
}

/** No new infrastructure: bounded, leased work on the existing hourly schedule. */
export async function retryModeration(env: Cloudflare.Env, clock = Date.now) {
  const repository = new D1ModerationWorkRepository(env.DB);
  let completed = 0;
  for (const work of await repository.due(clock())) {
    const context = { id: work.id, token: crypto.randomUUID() };
    if (!(await repository.claim(work.id, context.token, clock()))) continue;
    try {
      await dispatch(env, work, context, clock);
      completed++;
    } catch (error) {
      if (error instanceof CheckUnavailable)
        await repository.retry(
          work,
          context,
          error.retryAfterMs,
          "provider_unavailable",
          clock(),
        );
      else if (
        error instanceof ApplicationError &&
        ["MODERATION_ACCOUNT_LIMIT", "MODERATION_CAPACITY"].includes(error.code)
      )
        await repository.retry(
          work,
          context,
          3_600_000,
          error.code,
          clock(),
          true,
        );
      else
        await repository.finish(
          context,
          error instanceof ApplicationError && error.status === 422
            ? "blocked"
            : "retry_required",
          undefined,
          error instanceof ApplicationError ? error.code : "retry_failed",
          clock(),
        );
    }
  }
  return completed;
}
