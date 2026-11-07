import { afterEach, expect, it } from "vitest";
import {
  chosenCountry,
  chosenLanguage,
  languageFor,
  marketCookie,
} from "../../server/catalog/domain/languages";
import {
  changesLanguage,
  languageHref,
  readPageCountryFrom,
  readPageLanguageFrom,
} from "../../server/catalog/domain/markets";
import {
  languageChoice,
  languageRedirect,
  publicRoute,
} from "../../server/shared/http/public-cache";
import { addDictionary, pageLocale, serverMessage, t } from "../../app/i18n";
import { en } from "../../app/i18n/en";

const url = (path: string) => new URL(`https://veganalts.test${path}`);
const redirect = (path: string, cookies: string | null) =>
  languageRedirect(url(path), publicRoute(url(path))!, true, cookies);

it("lands on a visitor's language only where the country offers it", () => {
  expect(languageFor("ca", "fr", true)).toBe("fr");
  expect(languageFor("ca", "fr", false)).toBe("en");
  expect(languageFor("us", "fr", true)).toBe("en");
  expect(languageFor("ca", null, true)).toBe("en");
});

it("a language-less address follows the cookie; an explicit one never does", () => {
  expect(redirect("/ca/ground-beef", "a=1; va_lang=fr")).toBe(
    "/ca/fr/ground-beef",
  );
  expect(redirect("/ca/ground-beef", null)).toBe("/ca/en/ground-beef");
  expect(redirect("/us/ground-beef", "va_lang=fr")).toBe("/us/en/ground-beef");
  expect(redirect("/ca/en/ground-beef", "va_lang=fr")).toBeNull();
});

it("saves a chosen language and drops it from the address", () => {
  const choice = languageChoice(url("/ca/fr/milk?setlang=fr&sort=best"))!;
  expect(choice.location).toBe("/ca/fr/milk?sort=best");
  expect(choice.cookie).toContain("va_lang=fr; Path=/");
  expect(choice.cookie).toContain("Secure");
  expect(languageChoice(url("/ca/fr/milk?setlang=zz"))).toBeNull();
  expect(languageChoice(url("/ca/fr/milk"))).toBeNull();
});

it("links the same page in another language", () => {
  expect(languageHref("/ca/en/milk?sort=best", "fr")).toBe(
    "/ca/fr/milk?sort=best&setlang=fr",
  );
  expect(languageHref("/ca/en", "fr")).toBe("/ca/fr?setlang=fr");
  expect(languageHref("/add-product?country=ca", "fr")).toBeNull();
  expect(languageHref("/", "fr")).toBeNull();
});

it("fills in values and falls back to English", () => {
  expect(t("language.prompt", { language: "Français" })).toBe(
    "View this page in Français?",
  );
});

afterEach(() => {
  readPageLanguageFrom(() => null);
  readPageCountryFrom(() => null);
});

it("a country's text comes first, then its language's, then English", () => {
  addDictionary(
    "fr",
    { ...en, "common.sending": "Partagé", "common.no": "Aussi partagé" },
    { "Shared.": "Partagé." },
    {
      fr: {
        locale: "fr-FR",
        messages: { "common.sending": "Pour la France" },
        serverText: { "Shared.": "Pour la France." },
      },
    },
  );
  readPageLanguageFrom(() => "fr");
  readPageCountryFrom(() => "fr");
  expect(t("common.sending")).toBe("Pour la France");
  expect(t("common.no")).toBe("Aussi partagé");
  expect(serverMessage("Shared.")).toBe("Pour la France.");
  expect(pageLocale()).toBe("fr-FR");
  readPageCountryFrom(() => "ca");
  expect(t("common.sending")).toBe("Partagé");
  expect(serverMessage("Shared.")).toBe("Partagé.");
  expect(pageLocale()).toBe("fr-CA");
});

it("a page with no country in its address uses the last one viewed", () => {
  expect(marketCookie("/be/fr/milk", true)).toBe(
    "va_market=fr-be; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
  );
  expect(marketCookie("/account", false)).toBeNull();
  expect(chosenLanguage("/account", "va_lang=en; va_market=fr-be")).toBe("fr");
  expect(chosenCountry("/account", "", "va_market=fr-be")).toBe("be");
  expect(chosenCountry("/add-product", "?country=FR", "va_market=fr-be")).toBe(
    "fr",
  );
  // Pages cached for everyone never vary.
  expect(chosenCountry("/about/terms", "", "va_market=fr-be")).toBeNull();
  expect(chosenLanguage("/about/terms", "va_market=fr-be")).toBeNull();
});

it("a link to another language needs a full page load", () => {
  readPageLanguageFrom(() => "fr");
  expect(changesLanguage("/ca/en/milk?sort=new")).toBe(true);
  expect(changesLanguage("/ca/fr/milk")).toBe(false);
  expect(changesLanguage("/add-product")).toBe(false);
  readPageLanguageFrom(() => null);
  expect(changesLanguage("/ca/fr")).toBe(true);
  expect(changesLanguage("/us/en")).toBe(false);
});
