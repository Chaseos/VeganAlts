import { requireAdministrator } from "../../auth/application/session";
import { BetterAuthSessionReader } from "../../auth/infrastructure/session-reader";
import { ApplicationError } from "../../shared/domain/errors";
import { requireSameOrigin } from "../../shared/http/security";
import { limitedFormData } from "../../shared/http/limited-form";
import { MAX_UPLOAD_BYTES, validateSlot } from "../domain/media";
import { uploadService } from "../infrastructure/composition";

export async function handleUpload(request: Request, env: Cloudflare.Env) {
  requireSameOrigin(request, env.APP_URL);
  const actor = await requireAdministrator(
    request,
    new BetterAuthSessionReader(env),
    env.ADMIN_USER_IDS,
  );
  if (!(await env.UPLOAD_RATE_LIMIT.limit({ key: actor.id })).success)
    throw new ApplicationError(
      "RATE_LIMITED",
      "Please wait a minute before uploading again.",
      429,
    );
  const form = await limitedFormData(request, MAX_UPLOAD_BYTES + 64 * 1024);
  const file = form.get("image");
  if (!(file instanceof File) || form.getAll("image").length !== 1)
    throw new ApplicationError("INVALID_FILE", "Choose exactly one image.");
  for (const field of ["productVersionId", "slot", "idempotencyKey"])
    if (form.getAll(field).length !== 1 || typeof form.get(field) !== "string")
      throw new ApplicationError("INVALID_FORM", `Supply one ${field} value.`);
  const productVersionId = String(form.get("productVersionId"));
  if (productVersionId.length > 100)
    throw new ApplicationError("INVALID_FORM", "Invalid formula ID.");
  return uploadService(env).upload({
    userId: actor.id,
    productVersionId,
    slot: validateSlot(String(form.get("slot"))),
    idempotencyKey: String(form.get("idempotencyKey")),
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
}
