import { z } from "zod";
import { ApplicationError } from "../../shared/domain/errors";
import { requireSameOrigin } from "../../shared/http/security";
import { limitedJson, success } from "../../shared/http/json";
import { protectContribution } from "../../abuse/service";
import { communityActor } from "../../community/http/handlers";
import { scheduleCatalogInvalidation } from "../../catalog/infrastructure/invalidation";
import { commentFormula, commentSort, commentVote } from "../domain/comments";
import { commentServices } from "../infrastructure/composition";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const slug = z.string().regex(/^[a-z0-9-]{1,100}$/);
const key = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/);
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApplicationError(
      "INVALID_INPUT",
      result.error.issues[0]?.message ?? "Check the details and try again.",
    );
  return result.data;
}

/** The public comment page is session-free so the shared cache can hold it. */
export async function publicComments(
  request: Request,
  productSlug: string,
  env: Cloudflare.Env,
) {
  if (env.APP_ENV === "production")
    throw new ApplicationError("NOT_FOUND", "This page is not available.", 404);
  const url = new URL(request.url);
  return success(
    await commentServices(env).page(
      parse(slug, productSlug),
      parse(commentSort, url.searchParams.get("sort") ?? "best"),
      parse(commentFormula, url.searchParams.get("formula") ?? "current"),
      url.searchParams.get("cursor"),
    ),
  );
}

async function purgeProduct(env: Cloudflare.Env, productId: string) {
  const product = await env.DB.prepare("SELECT slug FROM products WHERE id=?")
    .bind(productId)
    .first<{ slug: string }>();
  if (product)
    scheduleCatalogInvalidation([
      { kind: "product", slug: product.slug, pageOnly: true },
    ]);
}

export async function commentsApi(
  request: Request,
  path: string,
  env: Cloudflare.Env,
): Promise<Response | null> {
  const parts = path.split("/");
  if (path !== "me/comment-state" && parts[0] !== "comments") return null;
  const actor = await communityActor(request, env),
    services = commentServices(env);
  if (request.method === "GET" || request.method === "HEAD") {
    if (path !== "me/comment-state") return null;
    return success(
      await services.personal(
        actor,
        parse(id, new URL(request.url).searchParams.get("productId")),
      ),
      {},
      true,
    );
  }
  if (request.method !== "POST") return null;
  requireSameOrigin(request, env.APP_URL);
  const requestKey = parse(key, request.headers.get("Idempotency-Key"));
  const [, commentId, operation] = parts;
  await protectContribution(
    request,
    env,
    "community",
    actor.id,
    request.headers.get("X-Turnstile-Token") ?? undefined,
    operation === "vote" ? env.VOTE_RATE_LIMIT : env.COMMENT_RATE_LIMIT,
  );
  const body = await limitedJson(request, 16 * 1024);
  if (parts.length === 1)
    return success(await services.create(actor, requestKey, body), {}, true);
  if (parts.length !== 3) return null;
  const target = parse(id, commentId);
  if (operation === "vote") {
    return success(
      await services.vote(actor, target, parse(commentVote, body).value),
      {},
      true,
    );
  }
  if (operation === "edit")
    return success(await services.edit(actor, target, body), {}, true);
  if (operation === "delete") {
    const result = await services.remove(actor, target);
    await purgeProduct(env, result.productId);
    return success(result, {}, true);
  }
  return null;
}
