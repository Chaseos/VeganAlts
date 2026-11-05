import { requireUser } from "../../auth/application/session";
import { BetterAuthSessionReader } from "../../auth/infrastructure/session-reader";
import { clientKey, enforceLimit } from "../../abuse/service";
import { requireSameOrigin } from "../../shared/http/security";
import { success } from "../../shared/http/json";
import { savedProductsService } from "../infrastructure/composition";

/** PUT or DELETE /api/v1/me/saved-products/:productId. Both are idempotent. */
export async function savedProductsApi(
  request: Request,
  path: string,
  env: Cloudflare.Env,
) {
  const [scope, family, productId, extra] = path.split("/");
  if (
    scope !== "me" ||
    family !== "saved-products" ||
    !productId ||
    extra !== undefined ||
    (request.method !== "PUT" && request.method !== "DELETE")
  )
    return null;
  requireSameOrigin(request, env.APP_URL);
  const user = await requireUser(request, new BetterAuthSessionReader(env));
  await enforceLimit(env.RATING_RATE_LIMIT, `saved-ip:${clientKey(request)}`);
  await enforceLimit(env.RATING_RATE_LIMIT, `saved:${user.id}`);
  const service = savedProductsService(env);
  const saved = request.method === "PUT";
  if (saved) await service.save(user.id, productId);
  else await service.remove(user.id, productId);
  return success({ productId, saved }, {}, true);
}
