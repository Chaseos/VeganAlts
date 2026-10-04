import { env } from "cloudflare:workers";
import { readMedia } from "@server/media/infrastructure/media-reader";
import type { Route } from "./+types/media";

export async function loader({ request, params }: Route.LoaderArgs) {
  return readMedia(
    env.DB,
    env.MEDIA_BUCKET,
    params.imageId,
    params.variant,
    request,
  );
}
