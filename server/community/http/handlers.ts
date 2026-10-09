import { z } from "zod";
import {
  requireAdministrator,
  requireUser,
} from "../../auth/application/session";
import { BetterAuthSessionReader } from "../../auth/infrastructure/session-reader";
import { protectContribution, enforceLimit } from "../../abuse/service";
import { ApplicationError } from "../../shared/domain/errors";
import { catalogIsPublic } from "../../shared/domain/launch";
import { requireSameOrigin } from "../../shared/http/security";
import { limitedJson, success } from "../../shared/http/json";
import { limitedFormData } from "../../shared/http/limited-form";
import { MAX_UPLOAD_BYTES } from "../../media/domain/media";
import { readModeratedMedia } from "../../media/infrastructure/media-reader";
import { communityServices } from "../infrastructure/composition";
import { invalidateCommunityProduct } from "../infrastructure/invalidation";
import {
  id,
  key,
  imageSlot,
  submissionInput,
  submissionIdentity,
  reportInput,
  changeInput,
  retailerInput,
  reviewDecision,
  reviewKind,
  inboxFilter,
  consolidationInput,
  countryCode,
  note,
  type Actor,
} from "../domain/contracts";

export async function communityActor(
  request: Request,
  env: Cloudflare.Env,
  admin = false,
): Promise<Actor> {
  if (!catalogIsPublic(env))
    throw new ApplicationError("NOT_FOUND", "This page is not available.", 404);
  const sessions = new BetterAuthSessionReader(env);
  const user = admin
    ? await requireAdministrator(request, sessions, env.ADMIN_USER_IDS)
    : await requireUser(request, sessions);
  return {
    id: user.id,
    accountState: user.profile.accountState,
    administrator: env.ADMIN_USER_IDS.split(",")
      .map((s) => s.trim())
      .includes(user.id),
  };
}
export function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApplicationError(
      "INVALID_INPUT",
      result.error.issues
        .slice(0, 5)
        .map(
          (i) => `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}`,
        )
        .join(" "),
    );
  return result.data;
}
const roots = new Set([
  "community",
  "submissions",
  "reports",
  "proposals",
  "retailers",
  "retailer-confirmations",
]);
export async function communityApi(
  request: Request,
  path: string,
  env: Cloudflare.Env,
): Promise<Response | null> {
  const parts = path.split("/"),
    [root, second, third, fourth, fifth] = parts;
  if (
    !roots.has(root ?? "") &&
    !path.startsWith("me/contributions") &&
    !path.startsWith("admin/moderation/")
  )
    return null;
  const admin = root === "admin",
    actor = await communityActor(request, env, admin),
    services = communityServices(env),
    url = new URL(request.url);
  const respond = (value: unknown) => success(value, {}, true);
  if (request.method === "GET" || request.method === "HEAD") {
    if (admin && third === "media" && fourth && fifth && parts.length === 5)
      return readModeratedMedia(
        env.DB,
        env.MEDIA_BUCKET,
        parse(id, fourth),
        parse(z.enum(["full", "thumbnail", "evidence"]), fifth),
        request,
      );
    if (path === "community/options")
      return respond(
        await services.contributions.options(
          actor,
          url.searchParams.get("q") ?? "",
          parse(countryCode, url.searchParams.get("country") ?? "US"),
        ),
      );
    if (path === "community/session")
      return respond({
        administrator: actor.administrator,
        turnstileSiteKey: env.TURNSTILE_SITE_KEY,
      });
    if (
      root === "community" &&
      second === "products" &&
      third &&
      parts[3] === "proposals" &&
      parts.length === 4
    )
      return respond(
        await services.contributions.openProposals(actor, parse(id, third)),
      );
    if (
      root === "community" &&
      second === "products" &&
      third &&
      parts.length === 3
    )
      return respond(
        await services.contributions.product(actor, parse(id, third)),
      );
    if (path === "me/contributions")
      return respond(
        await services.moderation.contributions(
          actor,
          url.searchParams.get("cursor"),
        ),
      );
    if (
      root === "me" &&
      second === "contributions" &&
      third &&
      fourth &&
      parts.length === 4
    )
      return respond(
        await services.moderation.detail(
          actor,
          parse(reviewKind, third),
          parse(id, fourth),
        ),
      );
    if (
      root === "submissions" &&
      second &&
      third === "media" &&
      fourth &&
      fifth &&
      parts.length === 5
    )
      return new Response(
        await services.media.read(
          actor,
          parse(id, second),
          parse(id, fourth),
          parse(z.enum(["full", "thumbnail", "evidence"]), fifth),
        ),
        {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    if (path === "admin/moderation/inbox")
      return respond(
        await services.moderation.inbox(
          actor,
          url.searchParams.get("cursor"),
          parse(inboxFilter, url.searchParams.get("filter") ?? "all"),
        ),
      );
    if (path === "admin/moderation/duplicate-preview")
      return respond(
        await services.moderation.previewConsolidation(
          actor,
          parse(id, url.searchParams.get("donor")),
          parse(id, url.searchParams.get("survivor")),
        ),
      );
    if (admin && third === "products" && fourth && parts.length === 4)
      return respond(
        await services.moderation.product(actor, parse(id, fourth)),
      );
    if (admin && third && fourth && parts.length === 4)
      return respond(
        await services.moderation.detail(
          actor,
          parse(reviewKind, third),
          parse(id, fourth),
        ),
      );
  } else if (request.method === "POST") {
    requireSameOrigin(request, env.APP_URL);
    const requestKey = parse(key, request.headers.get("Idempotency-Key"));
    await protectContribution(
      request,
      env,
      "community",
      actor.id,
      request.headers.get("X-Turnstile-Token") ?? undefined,
    );
    if (
      root === "submissions" &&
      second &&
      third === "uploads" &&
      parts.length === 3
    ) {
      await enforceLimit(env.UPLOAD_RATE_LIMIT, `user:${actor.id}`);
      const form = await limitedFormData(request, MAX_UPLOAD_BYTES + 64 * 1024),
        file = form.get("image");
      if (!(file instanceof File))
        throw new ApplicationError(
          "INVALID_IMAGE",
          "Choose a JPEG, PNG, or WebP photo.",
        );
      return respond(
        await services.media.upload(actor, {
          receiptId: parse(id, second),
          slot: parse(imageSlot, form.get("slot")),
          idempotencyKey: requestKey,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }),
      );
    }
    const body = await limitedJson(request, 32 * 1024);
    let result: unknown;
    if (path === "submissions/check-identity")
      result = await services.submissions.checkIdentity(
        actor,
        parse(submissionIdentity, body),
      );
    else if (path === "submissions/preflight")
      result = await services.submissions.preflight(
        actor,
        requestKey,
        parse(submissionInput, body),
      );
    else if (path === "submissions/evidence")
      result = await services.submissions.evidenceReceipt(
        actor,
        requestKey,
        parse(z.object({ productId: id }).strict(), body).productId,
      );
    else if (
      root === "submissions" &&
      second &&
      third === "finalize" &&
      parts.length === 3
    )
      result = await services.submissions.finalize(
        actor,
        parse(id, second),
        parse(submissionInput, body),
      );
    else if (path === "reports")
      result = await services.contributions.report(
        actor,
        requestKey,
        parse(reportInput, body),
      );
    else if (path === "proposals")
      result = await services.contributions.propose(
        actor,
        requestKey,
        parse(changeInput, body),
      );
    else if (
      root === "proposals" &&
      second &&
      third === "responses" &&
      parts.length === 3
    )
      result = await services.contributions.respond(
        actor,
        requestKey,
        parse(id, second),
        body,
      );
    else if (path === "retailers/proposals")
      result = await services.contributions.proposeRetailer(
        actor,
        requestKey,
        parse(retailerInput, body),
      );
    else if (path === "retailer-confirmations")
      result = await services.contributions.confirm(
        actor,
        requestKey,
        parse(
          z
            .object({
              productId: id,
              retailerId: id,
              stance: z.enum(["confirm", "not_current"]),
            })
            .strict(),
          body,
        ),
      );
    else if (path === "admin/moderation/consolidations")
      result = await services.moderation.consolidate(
        actor,
        requestKey,
        parse(consolidationInput, body),
      );
    else if (
      admin &&
      third === "actions" &&
      fourth &&
      fifth === "reverse" &&
      parts.length === 5
    )
      result = await services.moderation.reverse(
        actor,
        requestKey,
        parse(id, fourth),
        parse(
          z
            .object({ expectedRevision: z.number().int().nonnegative(), note })
            .strict(),
          body,
        ),
      );
    else if (
      admin &&
      third &&
      fourth &&
      fifth === "decide" &&
      parts.length === 5
    )
      result = await services.moderation.decide(
        actor,
        requestKey,
        parse(reviewKind, third),
        parse(id, fourth),
        parse(reviewDecision, body),
      );
    else throw new ApplicationError("NOT_FOUND", "Endpoint not found.", 404);
    if (
      result &&
      typeof result === "object" &&
      "productId" in result &&
      typeof result.productId === "string"
    )
      await invalidateCommunityProduct(env.DB, result.productId, {
        actionId:
          "actionId" in result && typeof result.actionId === "string"
            ? result.actionId
            : undefined,
        // Retailer reports feed the store filter on the product's rankings.
        scope: path === "retailer-confirmations" ? "listings" : "all",
      });
    return respond(result);
  }
  throw new ApplicationError("NOT_FOUND", "Endpoint not found.", 404);
}
