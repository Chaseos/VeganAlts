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

export function requireCatalogPreview(environment: string) {
  if (environment === "production")
    throw new Response("Not found", { status: 404 });
}
