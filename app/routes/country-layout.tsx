import { env } from "cloudflare:workers";
import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { publicCatalogService } from "@server/catalog/infrastructure/composition";
import { pageLanguage, publicLoader } from "@server/catalog/http/loader";
import { splitLanguage } from "@server/catalog/domain/languages";
import { catalogIsPublic } from "@server/shared/domain/launch";
import type { SiteChrome } from "../lib/site-chrome";
import type { Route } from "./+types/country-layout";

// One country's chrome: the active market, the country list and the aisle
// tree. Public pages embed it, so it holds no personal data.
export async function loader({ params, request }: Route.LoaderArgs) {
  // Before launch only the coming-soon home is reachable, without D1 reads.
  if (!catalogIsPublic(env)) return { chrome: null, market: null };
  const language = pageLanguage(request);
  const page = await publicLoader(() =>
    publicCatalogService(env, language).page(params.country ?? "us"),
  );
  const chrome: SiteChrome = {
    language,
    country: {
      code: page.market.code,
      name: page.market.name,
      hasRankings: page.hasRankings,
    },
    countries: page.countries,
    aisles: page.aisles.map((aisle) => ({
      slug: aisle.slug,
      name: aisle.name,
      foods: aisle.foods.map((food) => ({
        slug: food.slug,
        name: food.name,
        productCount: food.productCount,
      })),
    })),
  };
  return { chrome, market: page.market };
}

// Within a country only the leaf route's data changes (the chrome changes only
// with taxonomy edits, which purge every page); it reloads with the country or
// the language.
export function shouldRevalidate({
  currentParams,
  nextParams,
  currentUrl,
  nextUrl,
}: ShouldRevalidateFunctionArgs) {
  return (
    (currentParams.country ?? "us") !== (nextParams.country ?? "us") ||
    splitLanguage(currentUrl.pathname).language !==
      splitLanguage(nextUrl.pathname).language
  );
}

export default function CountryLayout() {
  return <Outlet />;
}
