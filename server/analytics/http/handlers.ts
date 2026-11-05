import { clientKey, enforceLimit } from "../../abuse/service";
import { success } from "../../shared/http/json";
import { requireSameOrigin } from "../../shared/http/security";
import { productAnalyticsService } from "../infrastructure/composition";

/** POST /api/v1/products/:productId/views. Anonymous; stores only a daily count. */
export async function productViewsApi(
  request: Request,
  path: string,
  env: Cloudflare.Env,
) {
  const [family, productId, resource, extra] = path.split("/");
  if (
    family !== "products" ||
    !productId ||
    resource !== "views" ||
    extra !== undefined ||
    request.method !== "POST"
  )
    return null;
  requireSameOrigin(request, env.APP_URL);
  await enforceLimit(env.EVENT_RATE_LIMIT, clientKey(request));
  await productAnalyticsService(env).recordView(productId);
  return success({ received: true }, {}, true);
}
