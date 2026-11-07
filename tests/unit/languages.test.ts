import { afterEach, expect, it } from "vitest";
import {
  chosenCountry,
  chosenLanguage,
  languageFor,
  languageTag,
  marketCookie,
} from "../../server/catalog/domain/languages";
import {
  changesLanguage,
  hreflang,
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
import { de } from "../../app/i18n/de";
import { swissGerman } from "../../app/i18n/de/switzerland";
import { errors as frenchErrors, fr, markets } from "../../app/i18n/fr";
import { allergenName } from "../../server/catalog/domain/local-names";
import { TAXONOMY_COUNTRIES } from "../../db/seed/taxonomy";
import { REVIEW_ALLERGENS } from "../../server/community/domain/allergens";

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

it("a market can word its own {inCountry}", () => {
  addDictionary(
    "de",
    { ...en, "common.sending": "Nur {inCountry}" },
    {},
    {
      ch: { locale: "de-CH", inCountry: "in der Schweiz" },
    },
  );
  readPageLanguageFrom(() => "de");
  readPageCountryFrom(() => "ch");
  expect(t("common.sending", { country: "Schweiz" })).toBe(
    "Nur in der Schweiz",
  );
  readPageCountryFrom(() => "us");
  expect(t("common.sending", { country: "USA" })).toBe("Nur in USA");
});

it("a page with no country in its address uses the last one viewed", () => {
  expect(marketCookie("/be/fr/milk", true)).toBe(
    "va_market=fr-be; Path=/; Max-Age=31536000; SameSite=Lax; Secure",
  );
  expect(marketCookie("/account", false)).toBeNull();
  expect(chosenLanguage("/account", "va_lang=en; va_market=fr-be")).toBe("fr");
  expect(chosenCountry("/account", "", "va_market=fr-be")).toBe("be");
  expect(chosenLanguage("/report-translation", null, "?language=de")).toBe(
    "de",
  );
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

it("France and its neighbours use EU allergen names; Canada keeps its own", () => {
  readPageLanguageFrom(() => "fr");
  readPageCountryFrom(() => "ca");
  expect(allergenName("soy", "Soybeans")).toBe("Soya");
  expect(allergenName("tree_nuts", "Nuts")).toBe("Noix");
  for (const country of ["fr", "be", "lu", "ch"]) {
    readPageCountryFrom(() => country);
    expect(allergenName("soy", "Soybeans")).toBe("Soja");
  }
  readPageCountryFrom(() => "fr");
  expect(allergenName("tree_nuts", "Nuts")).toBe("Fruits à coque");
  readPageCountryFrom(() => "ch");
  expect(allergenName("tree_nuts", "Nuts")).toBe("Fruits à coque dure");
  readPageLanguageFrom(() => "de");
  expect(allergenName("sulphites", "x")).toBe("Schwefeldioxid und Sulfite");
  readPageCountryFrom(() => "de");
  expect(allergenName("sulphites", "x")).toBe("Schwefeldioxid und Sulphite");
});

it("European French spaces its punctuation and keeps links and fragments", () => {
  const text = markets.fr.messages;
  for (const [key, message] of Object.entries(text)) {
    const value = JSON.stringify(message);
    expect(value, key).not.toMatch(/\S[?!;](?:[\s"]|$)/u);
    expect(value, key).not.toContain("://\u00a0");
    expect(value, key).not.toContain("courriel");
  }
  expect(Object.keys(text).length).toBeLessThan(Object.keys(fr).length);
  expect(markets.be.serverText).toBe(markets.fr.serverText);
  expect(Object.keys(frenchErrors)).toEqual(
    expect.arrayContaining(Object.keys(markets.fr.serverText)),
  );
});

it("Swiss German keeps only the entries its spelling changes", () => {
  const swiss = swissGerman({ a: "Straße „hier“", b: "Haus" });
  expect(swiss).toEqual({ a: "Strasse «hier»" });
  expect(JSON.stringify(swissGerman(de))).not.toContain("ß");
});

it("European countries list the 14 groups, and every animal one needs review", () => {
  for (const iso2 of ["DE", "FR", "IT", "AT", "CH", "BE", "LU"]) {
    const list = TAXONOMY_COUNTRIES.find((c) => c.iso2 === iso2)!.allergens;
    expect(list).toHaveLength(14);
    for (const key of ["milk", "egg", "fish", "crustacean", "mollusc"])
      expect(REVIEW_ALLERGENS).toContain(key);
  }
});

it("names Taiwan's Chinese in full for browsers and search engines", () => {
  expect(languageTag("zh")).toBe("zh-TW");
  expect(languageTag("ko")).toBe("ko");
  expect(hreflang("tw", "zh")).toBe("zh-TW");
  expect(hreflang("kr", "ko")).toBe("ko-KR");
  expect(languageFor("tw", null)).toBe("zh");
  expect(languageFor("kr", "en")).toBe("en");
});
