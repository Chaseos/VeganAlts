import { env } from "cloudflare:workers";
import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { catalogService } from "@server/catalog/infrastructure/composition";
import { publicLoader } from "@server/catalog/http/loader";
import { catalogIsPublic } from "@server/shared/domain/launch";
import type { SiteChrome } from "../lib/site-chrome";
import type { Route } from "./+types/country-layout";

// One country's chrome: the active market, the country list and the aisle
// tree. Public pages embed it, so it holds no personal data.
export async function loader({ params }: Route.LoaderArgs) {
  // Before launch only the coming-soon home is reachable, without D1 reads.
  if (!catalogIsPublic(env)) return { chrome: null, market: null };
  const page = await publicLoader(() =>
    catalogService(env).page(params.country ?? "us"),
  );
  const chrome: SiteChrome = {
    country: {
      code: page.market.code,
      name: page.market.name,
      hasRankings: page.hasRankings,
    },
    countries: page.countries,
    aisles: page.aisles.map((aisle) => ({
      slug: aisle.slug,
      name: aisle.name,
      shelves: aisle.shelves.map((shelf) => ({
        slug: shelf.slug,
        name: shelf.name,
        foods: shelf.foods.map((food) => ({
          slug: food.slug,
          name: food.name,
          productCount: food.productCount,
        })),
      })),
    })),
  };
  return { chrome, market: page.market };
}

// Within a country only the leaf route's data changes (the chrome changes only
// with taxonomy edits, which purge every page); it reloads with the country.
export function shouldRevalidate({
  currentParams,
  nextParams,
}: ShouldRevalidateFunctionArgs) {
  return (currentParams.country ?? "us") !== (nextParams.country ?? "us");
}

export default function CountryLayout() {
  return <Outlet />;
}
