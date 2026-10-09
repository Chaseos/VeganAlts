import { env } from "cloudflare:workers";
import { z } from "zod";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { catalogPage, categoryView } from "@server/catalog/application/service";
import { readFilters } from "@server/catalog/domain/filters";
import {
  ratingState,
  myRatings,
  saveRating,
} from "@server/ratings/http/handlers";
import { ApplicationError } from "@server/shared/domain/errors";
import { errorResponse, requireSameOrigin } from "@server/shared/http/security";
import { limitedJson, success } from "@server/shared/http/json";
import { clientEvents, recordEvent } from "@server/observability/events";
import { clientKey, enforceLimit } from "@server/abuse/service";
import type { Route } from "./+types/application-api";
import { communityApi } from "@server/community/http/handlers";
import { commentsApi, publicComments } from "@server/comments/http/handlers";
import { taxonomyApi } from "@server/taxonomy/http/handlers";

async function handle(request: Request, path: string) {
  try {
    const comments = await commentsApi(request, path, env);
    if (comments) return comments;
    const taxonomy = await taxonomyApi(request, path, env);
    if (taxonomy) return taxonomy;
    const community = await communityApi(request, path, env);
    if (community) return community;
    const url = new URL(request.url);
    if (request.method === "GET" || request.method === "HEAD") {
      if (path === "me/rating-state") return await ratingState(request, env);
      if (path === "me/ratings") return await myRatings(request, env);
      const catalog = catalogService(env);
      const [family, slug, extra] = path.split("/");
      if (family === "products" && slug && extra === "comments")
        return await publicComments(request, slug, env);
      if (family === "profiles" && slug && !extra)
        return success(await catalog.profile(slug));
      // Catalog reads belong to one active country (default United States).
      const market = await catalog.market(
        url.searchParams.get("country") ?? "us",
      );
      if (path === "search")
        return success(
          await catalog.search(market, url.searchParams.get("q") ?? ""),
        );
      if (path === "suggest")
        return success(
          await catalog.suggest(market, url.searchParams.get("q") ?? ""),
        );
      if (path === "categories") return success(await catalog.home(market));
      if (slug && !extra) {
        if (family === "categories") {
          const moved = await catalog.categoryRedirect(slug);
          if (moved)
            return new Response(null, {
              status: 302,
              headers: {
                Location: `/api/v1/categories/${moved}${url.search}`,
                "Cache-Control": "private, no-store",
              },
            });
          const checked = await catalog.validateFilters(
            market,
            readFilters(url.searchParams),
          );
          if (checked.changed)
            throw new ApplicationError(
              "INVALID_FILTER",
              "Choose stores and allergens offered in this country.",
            );
          return success(
            await catalog.category(market, slug, {
              page: catalogPage(url.searchParams.get("page")),
              unrankedPage: catalogPage(url.searchParams.get("unrankedPage")),
              view: categoryView(url.searchParams.get("view")),
              filters: checked.filters,
            }),
          );
        }
        if (family === "products") {
          const canonical = await catalog.canonicalRedirect(market, slug);
          if (canonical)
            return new Response(null, {
              status: 302,
              headers: {
                Location: `/api/v1/products/${canonical.slug}?country=${market.code}`,
                "Cache-Control": "private, no-store",
              },
            });
          return success(
            await catalog.product(
              market,
              slug,
              url.searchParams.get("version"),
            ),
          );
        }
      }
    } else if (path === "ratings") return await saveRating(request, env);
    else if (path === "events" && request.method === "POST") {
      requireSameOrigin(request, env.APP_URL);
      await enforceLimit(env.EVENT_RATE_LIMIT, clientKey(request));
      const input = z
        .object({
          event: z.enum(clientEvents),
          route: z.enum([
            "home",
            "search",
            "product",
            "category",
            "profile",
            "my-ratings",
            "account",
            "auth",
          ]),
        })
        .strict()
        .safeParse(await limitedJson(request, 512));
      if (!input.success)
        throw new ApplicationError("INVALID_EVENT", "Unknown event.");
      recordEvent(env, input.data.event, input.data.route, "client");
      return success({ received: true }, {}, true);
    }
    throw new ApplicationError("NOT_FOUND", "Endpoint not found.", 404);
  } catch (error) {
    return errorResponse(
      error,
      request.headers.get("X-Request-ID") ?? crypto.randomUUID(),
    );
  }
}

export const loader = ({ request, params }: Route.LoaderArgs) =>
  handle(request, params["*"] ?? "");
export const action = ({ request, params }: Route.ActionArgs) =>
  handle(request, params["*"] ?? "");
