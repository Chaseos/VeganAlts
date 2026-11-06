import type { Language } from "@server/catalog/domain/languages";
import { pageLanguage } from "@server/catalog/domain/markets";
import { en } from "./en";

export type MessageKey = keyof typeof en;
type Message = string | { one: string; other: string };
export type Dictionary = Record<MessageKey, Message>;

// English ships in the main bundle. A language without its dictionary yet
// shows English, so a preview page always renders.
const DICTIONARIES: Partial<Record<Language, Dictionary>> = { en };

const SERVER_TEXT: Partial<Record<Language, Record<string, string>>> = {};

/** Adds a language. The browser loads its chunk before hydrating. */
export function addDictionary(
  language: Language,
  dictionary: Dictionary,
  serverText: Record<string, string> = {},
) {
  DICTIONARIES[language] = dictionary;
  SERVER_TEXT[language] = serverText;
}

/**
 * A server error in the page's language. The API stays in English, so the
 * message itself is the key, and one naming data or unlisted stays as sent.
 */
export const serverMessage = (message: string) =>
  SERVER_TEXT[pageLanguage() ?? "en"]?.[message] ?? message;

const LOCALES: Record<Language, string> = {
  en: "en-US",
  fr: "fr-CA",
  ja: "ja-JP",
};

/** Dates and numbers follow the page's language. */
export const pageLocale = () => LOCALES[pageLanguage() ?? "en"];

/** The page's text for a key. `{name}` fills from `values`; `count` picks a plural. */
export function t(
  key: MessageKey,
  values: Record<string, string | number> = {},
): string {
  const message: Message =
    DICTIONARIES[pageLanguage() ?? "en"]?.[key] ?? en[key];
  const text =
    typeof message === "string"
      ? message
      : new Intl.PluralRules(pageLocale()).select(Number(values.count)) ===
          "one"
        ? message.one
        : message.other;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    String(values[name] ?? match),
  );
}
