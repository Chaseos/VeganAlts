import { useRouteLoaderData } from "react-router";

export interface ChromeCountry {
  code: string;
  name: string;
  hasRankings: boolean;
}

export interface ChromeFood {
  slug: string;
  name: string;
  productCount: number;
}

export interface ChromeShelf {
  slug: string;
  name: string;
  foods: ChromeFood[];
}

export interface ChromeAisle {
  slug: string;
  name: string;
  shelves: ChromeShelf[];
}

// Header, footer and menu data shared by every page in a country.
export interface SiteChrome {
  country: ChromeCountry;
  countries: ChromeCountry[];
  aisles: ChromeAisle[];
}

export const DEFAULT_COUNTRY: ChromeCountry = {
  code: "us",
  name: "United States",
  hasRankings: true,
};

const FALLBACK: SiteChrome = {
  country: DEFAULT_COUNTRY,
  countries: [DEFAULT_COUNTRY],
  aisles: [],
};

declare const __VEGANALTS_PREVIEW__: boolean | undefined;
// Set at build time (vite.config.ts); true for local and staging builds.
export const PREVIEW =
  typeof __VEGANALTS_PREVIEW__ === "undefined" ? true : __VEGANALTS_PREVIEW__;

export const COUNTRY_LAYOUT_ID = "routes/country-layout";

export function useSiteChrome(): SiteChrome {
  const data = useRouteLoaderData(COUNTRY_LAYOUT_ID) as
    { chrome?: SiteChrome } | undefined;
  return data?.chrome ?? FALLBACK;
}

export function homePath(country: string) {
  return country === "us" ? "/" : `/${country}`;
}

export function searchPath(country: string) {
  return `/${country}/search`;
}

export function foodPath(country: string, slug: string) {
  return `/${country}/${slug}`;
}

export function productPath(country: string, slug: string) {
  return `/${country}/products/${slug}`;
}
