import { ApplicationError } from "../../shared/domain/errors";
import {
  chosenCountry,
  chosenLanguage,
  defaultLanguage,
  languagesOf,
  splitLanguage,
  type Language,
} from "./languages";

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

// The language of the page being rendered, so a link stays in it without every
// caller passing it along. The browser reads its own address; the Worker sets
// this per request in workers/app.ts, because it serves many at once.
let currentLanguage = (): Language | null => {
  if (typeof location === "undefined") return null;
  const path = location.pathname.toLowerCase();
  return splitLanguage(path).language ?? chosenLanguage(path, document.cookie);
};
export const pageLanguage = () => currentLanguage();
export function readPageLanguageFrom(source: () => Language | null) {
  currentLanguage = source;
}

// The country of the same page, for text that differs by market: French in
// France isn't the shared French. Lowercase, and read the same two ways.
let currentCountry = (): string | null => {
  if (typeof location === "undefined") return null;
  const path = location.pathname.toLowerCase();
  return (
    path.match(/^\/([a-z]{2})\/[a-z]{2}(?=\/|$)/)?.[1] ??
    chosenCountry(path, location.search, document.cookie)
  );
};
export const pageCountry = () => currentCountry();
export function readPageCountryFrom(source: () => string | null) {
  currentCountry = source;
}

// Every country page names its language. A country that doesn't offer the
// page's language uses its default. Previews count: a language not live yet
// has no pages outside them.
const prefix = (code: string, language = currentLanguage()) =>
  `/${code}/${
    language && languagesOf(code, true).includes(language)
      ? language
      : defaultLanguage(code)
  }`;

export function homePath(code: string, language?: Language) {
  return prefix(code, language);
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

/**
 * The same page in another language, carrying the choice for the gateway to
 * save. Null on a page that isn't a country page.
 */
export function languageHref(page: string, language: Language) {
  const url = new URL(page, "https://page.invalid");
  const match = url.pathname.match(/^\/([a-z]{2})\/[a-z]{2}(?=\/|$)/);
  if (!match) return null;
  url.searchParams.set("setlang", language);
  return `/${match[1]}/${language}${url.pathname.slice(match[0].length)}${url.search}`;
}

/**
 * True when a link leaves the language this page loaded. Only a full page load
 * fetches the other dictionary, so such a link needs `reloadDocument`.
 */
export function changesLanguage(href: string) {
  const { language } = splitLanguage(href.split(/[?#]/)[0]!.toLowerCase());
  return !!language && language !== (currentLanguage() ?? "en");
}

export function hreflang(code: string, language: Language = "en") {
  return `${language}-${code.toUpperCase()}`;
}
