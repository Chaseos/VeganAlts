import { ApplicationError } from "../domain/errors";

export async function limitedFormData(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const tooLarge = () =>
    new ApplicationError(
      "REQUEST_TOO_LARGE",
      "The submitted form is too large.",
      413,
    );
  const length = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > maxBytes) throw tooLarge();
  if (!request.body)
    throw new ApplicationError("EMPTY_BODY", "The submitted form is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
    }).formData();
  } catch {
    throw new ApplicationError("INVALID_FORM", "Send a valid form.");
  }
}
