import { z } from "zod";
import { ApplicationError } from "../../shared/domain/errors";
import { requireSameOrigin } from "../../shared/http/security";
import { limitedJson, success } from "../../shared/http/json";
import { protectContribution } from "../../abuse/service";
import { communityActor, parse } from "../../community/http/handlers";
import { id, note } from "../../community/domain/contracts";
import { taxonomyServices } from "../infrastructure/composition";

const key = z.string().regex(/^[A-Za-z0-9_-]{16,100}$/);
const reason = z.object({ note }).strict();

/** Category proposals (contributors) and taxonomy management (operators). */
export async function taxonomyApi(
  request: Request,
  path: string,
  env: Cloudflare.Env,
): Promise<Response | null> {
  const parts = path.split("/");
  const operator =
    path.startsWith("admin/taxonomy") ||
    path.startsWith("admin/moderation/category/");
  if (!operator && path !== "category-proposals") return null;
  const actor = await communityActor(request, env, operator),
    services = taxonomyServices(env);
  const respond = (value: unknown) => success(value, {}, true);
  if (request.method === "GET" || request.method === "HEAD") {
    if (path === "admin/taxonomy") return respond(await services.tree(actor));
    if (parts[2] === "category" && parts[3] && parts.length === 4)
      return respond(await services.proposalDetail(actor, parse(id, parts[3])));
    return null;
  }
  if (request.method !== "POST") return null;
  requireSameOrigin(request, env.APP_URL);
  const requestKey = parse(key, request.headers.get("Idempotency-Key"));
  await protectContribution(
    request,
    env,
    "community",
    actor.id,
    request.headers.get("X-Turnstile-Token") ?? undefined,
  );
  const body = await limitedJson(request, 32 * 1024);
  if (path === "category-proposals")
    return respond(await services.propose(actor, requestKey, body));
  if (parts[2] === "category" && parts[3] && parts[4] === "decide")
    return respond(
      await services.decideProposal(
        actor,
        requestKey,
        parse(id, parts[3]),
        body,
      ),
    );
  const [, , family, target, operation] = parts;
  if (family === "categories" && !target)
    return respond(await services.create(actor, requestKey, body));
  if (family === "categories" && target && !operation)
    return respond(
      await services.update(actor, requestKey, parse(id, target), body),
    );
  if (family === "categories" && target && operation === "dimensions")
    return respond(
      await services.setDimensions(actor, requestKey, parse(id, target), body),
    );
  if (family === "features" && !target)
    return respond(await services.setFeatures(actor, requestKey, body));
  if (family === "merges" && !target)
    return respond(await services.merge(actor, requestKey, body));
  if (family === "merges" && target && operation === "continue")
    return respond(await services.continueMerge(actor, parse(id, target)));
  if (family === "merges" && target && operation === "reverse")
    return respond(
      await services.reverseMerge(
        actor,
        requestKey,
        parse(id, target),
        parse(reason, body).note,
      ),
    );
  if (family === "actions" && target && operation === "reverse")
    return respond(
      await services.reverseUpdate(
        actor,
        requestKey,
        parse(id, target),
        parse(reason, body).note,
      ),
    );
  throw new ApplicationError("NOT_FOUND", "Endpoint not found.", 404);
}
