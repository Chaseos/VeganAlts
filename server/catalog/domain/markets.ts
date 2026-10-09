import { ApplicationError } from "../../shared/domain/errors";

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

export function homePath(code: string) {
  return code === DEFAULT_COUNTRY ? "/" : `/${code}`;
}

export function searchPath(code: string) {
  return `/${code}/search`;
}

export function foodPath(code: string, slug: string) {
  return `/${code}/${slug}`;
}

export function productPath(code: string, slug: string) {
  return `/${code}/products/${slug}`;
}

export function hreflang(code: string) {
  return `en-${code.toUpperCase()}`;
}
