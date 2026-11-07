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

// Each in its own name, whatever the page's language.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  fr: "Français",
  ja: "日本語",
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

/** Where a visitor lands in a country: their choice if it's offered there. */
export function languageFor(
  country: string,
  preference: string | null | undefined,
  preview = false,
) {
  return (
    languagesOf(country, preview).find((code) => code === preference) ??
    defaultLanguage(country)
  );
}

const SHARED_PAGES = /^\/(?:$|about(?:\/|$)|users\/|api\/)/;

// The language and country a visitor last viewed, as `fr-be`. The browser
// writes it, so a page with neither in its address, such as /account, can match
// them. It never picks a country page's language: that stays with `va_lang`.
const lastViewed = (cookies: string | null | undefined) =>
  cookies?.match(/(?:^|;\s*)va_market=([a-z]{2})-([a-z]{2})(?:;|$)/);

/** The cookie that remembers a country page, or null on any other page. */
export function marketCookie(path: string, secure: boolean) {
  const { language } = splitLanguage(path);
  if (!language) return null;
  const market = `${language}-${path.slice(1, 3)}`;
  return `va_market=${market}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}

/**
 * A page with no language in its address follows the visitor's choice. Pages
 * cached for everyone, such as `/` and `/about`, never do.
 */
export function chosenLanguage(
  path: string,
  cookies: string | null | undefined,
) {
  if (SHARED_PAGES.test(path)) return null;
  const viewed = lastViewed(cookies)?.[1];
  if (isLanguage(viewed)) return viewed as Language;
  const chosen = cookies?.match(/(?:^|;\s*)va_lang=([a-z]{2})/)?.[1];
  return isLanguage(chosen) ? (chosen as Language) : null;
}

/**
 * The country of a page with no country in its address: the one it names, else
 * the one the visitor last viewed.
 */
export function chosenCountry(
  path: string,
  search: string,
  cookies: string | null | undefined,
) {
  if (SHARED_PAGES.test(path)) return null;
  const named = new URLSearchParams(search).get("country")?.toLowerCase();
  if (named && /^[a-z]{2}$/.test(named)) return named;
  return lastViewed(cookies)?.[2] ?? null;
}

/** Separates a language segment from a lowercase path: /ca/fr/beef. */
export function splitLanguage(path: string) {
  const match = path.match(/^\/([a-z]{2})\/([a-z]{2})(?=\/|$)(.*)$/);
  return match && isLanguage(match[2])
    ? { path: `/${match[1]}${match[3]}`, language: match[2] as Language }
    : { path, language: null };
}
