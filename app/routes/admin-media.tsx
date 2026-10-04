import { env } from "cloudflare:workers";
import { Form, data, redirect } from "react-router";
import { requireAdministrator } from "@server/auth/application/session";
import { BetterAuthSessionReader } from "@server/auth/infrastructure/session-reader";
import { IMAGE_SLOTS } from "@server/media/domain/media";
import { adminFormulaOptions } from "@server/media/infrastructure/media-reader";
import { handleUpload } from "@server/media/http/upload";
import { ApplicationError } from "@server/shared/domain/errors";
import type { Route } from "./+types/admin-media";

export function meta() {
  return [
    { title: "Image uploads · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
export async function loader({ request }: Route.LoaderArgs) {
  try {
    await requireAdministrator(
      request,
      new BetterAuthSessionReader(env),
      env.ADMIN_USER_IDS,
    );
  } catch (error) {
    if (error instanceof ApplicationError && error.status === 401)
      throw redirect("/sign-in");
    if (error instanceof ApplicationError)
      throw new Response(error.message, { status: error.status });
    throw error;
  }
  const reference = new URL(request.url).searchParams.get("upload");
  return {
    formulas: await adminFormulaOptions(env.DB),
    idempotencyKey:
      reference && /^[a-zA-Z0-9_-]{16,100}$/.test(reference)
        ? reference
        : crypto.randomUUID(),
    staging: env.APP_ENV !== "production",
  };
}
export async function action({ request }: Route.ActionArgs) {
  try {
    return { imageId: (await handleUpload(request, env)).imageId, error: null };
  } catch (error) {
    if (error instanceof ApplicationError)
      return data(
        { imageId: null, error: error.message },
        { status: error.status },
      );
    throw error;
  }
}
export default function AdminMedia({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main id="main" className="message-page">
      <a className="wordmark" href="/">
        VeganAlts.
      </a>
      <h1>Product image upload</h1>
      {loaderData.staging && (
        <p className="environment-note">Staging / development data</p>
      )}
      <p>
        Choose a JPEG, PNG, or WebP up to 10 MiB and 40 megapixels. Ingredients
        and nutrition uploads retain a larger evidence image for readability.
      </p>
      {!actionData?.imageId && (
        <Form
          method="post"
          action={`/admin/media?upload=${loaderData.idempotencyKey}`}
          encType="multipart/form-data"
          className="account-form"
          reloadDocument
        >
          <label htmlFor="formula">Product formula</label>
          <select name="productVersionId" id="formula" required defaultValue="">
            <option value="" disabled>
              Choose a product
            </option>
            {loaderData.formulas.map((formula) => (
              <option key={formula.id} value={formula.id}>
                {formula.brand} — {formula.name}
                {formula.developmentOnly ? " (development)" : ""}
              </option>
            ))}
          </select>
          <label htmlFor="slot">Image slot</label>
          <select name="slot" id="slot">
            {IMAGE_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {slot}
              </option>
            ))}
          </select>
          <label htmlFor="image">Image</label>
          <input
            id="image"
            name="image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
          />
          <label htmlFor="idempotency">Upload reference</label>
          <input
            id="idempotency"
            name="idempotencyKey"
            value={loaderData.idempotencyKey}
            readOnly
            aria-describedby="reference-help"
          />
          <p id="reference-help">
            Keep this reference when retrying an interrupted upload. Use a new
            reference for a different image.
          </p>
          <button className="button" disabled={!loaderData.formulas.length}>
            Upload image
          </button>
        </Form>
      )}
      {!loaderData.formulas.length && (
        <p>Add a reviewed product formula before uploading an image.</p>
      )}
      {actionData?.error && <p role="alert">{actionData.error}</p>}
      {actionData?.imageId && (
        <div role="status">
          <p>Image accepted and stored.</p>
          <a href={`/media/${actionData.imageId}/full`}>
            <img
              src={`/media/${actionData.imageId}/thumbnail`}
              alt="Accepted product upload"
              className="upload-preview"
            />
          </a>
          <p>
            <a href="/admin/media">Upload another image</a>
          </p>
        </div>
      )}
      <a href="/account">Your account</a>
    </main>
  );
}
