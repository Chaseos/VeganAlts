import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  applyFilters,
  hasFilters,
  intersectFilters,
  readFilters,
  type RankingFilters,
} from "@server/catalog/domain/filters";
import {
  parseCountryList,
  PREFERENCE_KEYS,
  usePreferenceValue,
  writeCountryList,
} from "./device-preferences";
import { useHydrated } from "./use-hydrated";

// The visitor's saved stores and Free-from allergens for one country.
export function useSavedFilters(country: string): RankingFilters {
  const stores = usePreferenceValue(PREFERENCE_KEYS.stores);
  const freeFrom = usePreferenceValue(PREFERENCE_KEYS.freeFrom);
  return {
    stores: parseCountryList(stores, country),
    freeFrom: parseCountryList(freeFrom, country),
  };
}

export function saveFilters(country: string, filters: RankingFilters) {
  writeCountryList(PREFERENCE_KEYS.stores, country, filters.stores);
  writeCountryList(PREFERENCE_KEYS.freeFrom, country, filters.freeFrom);
}

// A ranking URL with the given filters, keeping view and resetting page.
export function filteredHref(
  pathname: string,
  search: string,
  filters: RankingFilters,
) {
  const params = applyFilters(new URLSearchParams(search), filters);
  params.delete("page");
  params.delete("unrankedPage");
  return `${pathname}${params.size ? `?${params}` : ""}`;
}

// Cached pages are rendered without anyone's filters. After hydration, a
// ranking opened without filter parameters applies the saved choice by
// replacing the URL; values the country no longer offers are ignored.
export function useApplySavedFilters(
  country: string,
  available: { stores: string[]; freeFrom: string[] },
) {
  const hydrated = useHydrated();
  const location = useLocation();
  const navigate = useNavigate();
  const saved = useSavedFilters(country);
  const applied = useRef<string | null>(null);
  const savedKey = JSON.stringify(saved);
  const availableKey = JSON.stringify(available);
  useEffect(() => {
    if (!hydrated || applied.current === location.key) return;
    applied.current = location.key;
    const params = new URLSearchParams(location.search);
    if (params.has("stores") || params.has("freeFrom")) return;
    const wanted = intersectFilters(
      JSON.parse(savedKey) as RankingFilters,
      JSON.parse(availableKey) as { stores: string[]; freeFrom: string[] },
    );
    if (!hasFilters(wanted)) return;
    void navigate(filteredHref(location.pathname, location.search, wanted), {
      replace: true,
      preventScrollReset: true,
    });
  }, [hydrated, location, navigate, savedKey, availableKey]);
}

// A link to a food's ranking that carries the saved filters once hydrated
// (the server snapshot is the plain URL, matching cached HTML).
export function useFoodHref(country: string, path: string) {
  const hydrated = useHydrated();
  const saved = useSavedFilters(country);
  if (!hydrated || !hasFilters(saved)) return path;
  return filteredHref(path, "", saved);
}

export function currentFilters(search: string) {
  return readFilters(new URLSearchParams(search));
}
