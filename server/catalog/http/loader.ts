import { catalogIsPublic } from "../../shared/domain/launch";
import { ApplicationError } from "../../shared/domain/errors";

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
