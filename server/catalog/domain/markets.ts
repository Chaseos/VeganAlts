import { ApplicationError } from "../../shared/domain/errors";
import { defaultLanguage, type Language } from "./languages";

// A country's catalog. Routes use the lowercase ISO code; the database stores
// the uppercase ISO 3166-1 alpha-2 code.
export interface Market {
  id: string;
  code: string;
  iso2: string;
  name: string;
}

export interface MarketSummary {
  code: string;
  name: string;
  hasRankings: boolean;
}

export const DEFAULT_COUNTRY = "us";
const CODE = /^[a-z]{2}$/;

export function isCountryCode(value: string | null | undefined) {
  return !!value && CODE.test(value);
}

// Throws a 404 for anything that is not a two-letter code; whether the country
// is active is checked against the database.
export function parseCountryCode(value: string | null | undefined) {
  const code = (value ?? DEFAULT_COUNTRY).toLowerCase();
  if (!CODE.test(code))
    throw new ApplicationError(
      "NOT_FOUND",
      "This country is not available.",
      404,
    );
  return code;
}

// The default language has no path segment, so every older address keeps working.
const prefix = (code: string, language?: Language) =>
  language && language !== defaultLanguage(code)
    ? `/${code}/${language}`
    : `/${code}`;

export function homePath(code: string, language?: Language) {
  const path = prefix(code, language);
  return path === `/${DEFAULT_COUNTRY}` ? "/" : path;
}

export function searchPath(code: string, language?: Language) {
  return `${prefix(code, language)}/search`;
}

export function foodPath(code: string, slug: string, language?: Language) {
  return `${prefix(code, language)}/${slug}`;
}

// A product page, optionally about one of its foods (`?food=`).
export function productPath(
  code: string,
  slug: string,
  food?: string | null,
  language?: Language,
) {
  return `${prefix(code, language)}/products/${slug}${food ? `?food=${food}` : ""}`;
}

// A brand's page in a country (milestone 7).
export function brandPath(code: string, slug: string, language?: Language) {
  return `${prefix(code, language)}/brand/${slug}`;
}

export function hreflang(code: string, language: Language = "en") {
  return `${language}-${code.toUpperCase()}`;
}
