import { catalogIsPublic } from "../../shared/domain/launch";
import { ApplicationError } from "../../shared/domain/errors";
import { publicRoute } from "../../shared/http/public-cache";

/** The language a public page renders in, which only its URL decides. */
export const pageLanguage = (request: Request) =>
  publicRoute(new URL(request.url))?.language ?? "en";

export async function publicLoader<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ApplicationError)
      throw new Response(error.message, { status: error.status });
    throw error;
  }
}

export function requireCatalogPreview(env: {
  APP_ENV: string;
  PUBLIC_LAUNCH?: string;
}) {
  if (!catalogIsPublic(env)) throw new Response("Not found", { status: 404 });
}
