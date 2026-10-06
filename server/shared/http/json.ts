import { ApplicationError } from "../domain/errors";

export async function limitedJson(
  request: Pick<Request, "headers" | "body">,
  maxBytes = 4096,
): Promise<unknown> {
  if (
    request.headers.get("Content-Type")?.split(";")[0]?.trim() !==
    "application/json"
  )
    throw new ApplicationError(
      "INVALID_CONTENT_TYPE",
      "Send an application/json request.",
      415,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new ApplicationError("INVALID_JSON", "A request body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new ApplicationError(
          "BODY_TOO_LARGE",
          "The request is too large.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApplicationError("INVALID_JSON", "Send a valid JSON body.");
  }
}

export function success<T>(
  data: T,
  meta: Record<string, unknown> = {},
  privateResponse = false,
) {
  return Response.json(
    { data, meta },
    {
      headers: privateResponse ? { "Cache-Control": "private, no-store" } : {},
    },
  );
}
