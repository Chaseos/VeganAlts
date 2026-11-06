// A country's languages. These live in code because the gateway needs them
// before any D1 read, and a language needs a deploy of its translations anyway.

export const LANGUAGES = ["en", "fr", "ja"] as const;
export type Language = (typeof LANGUAGES)[number];

interface CountryLanguages {
  default: Language;
  // Live for everyone.
  offered: readonly Language[];
  // Reachable only on previews until its translations are reviewed.
  preview?: readonly Language[];
}

const ENGLISH: CountryLanguages = { default: "en", offered: ["en"] };
const COUNTRY_LANGUAGES: Record<string, CountryLanguages> = {
  ca: { default: "en", offered: ["en"], preview: ["fr"] },
  jp: { default: "ja", offered: ["en"], preview: ["ja"] },
};

export const isLanguage = (value: string | null | undefined) =>
  LANGUAGES.includes(value as Language);

const settings = (country: string) => COUNTRY_LANGUAGES[country] ?? ENGLISH;

export const defaultLanguage = (country: string) => settings(country).default;

/** What a country's visitors can open, default first. */
export function languagesOf(country: string, preview = false) {
  const { default: main, offered, preview: extra = [] } = settings(country);
  return [
    ...new Set([main, ...offered, ...(preview ? extra : [])]),
  ] as readonly Language[];
}

/** Separates a language segment from a lowercase path: /ca/fr/beef. */
export function splitLanguage(path: string) {
  const match = path.match(/^\/([a-z]{2})\/([a-z]{2})(?=\/|$)(.*)$/);
  return match && isLanguage(match[2])
    ? { path: `/${match[1]}${match[3]}`, language: match[2] as Language }
    : { path, language: null };
}
