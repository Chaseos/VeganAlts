import { expect, it } from "vitest";
import {
  languageFor,
  languageTag,
} from "../../server/catalog/domain/languages";
import { hreflang, languageHref } from "../../server/catalog/domain/markets";
import {
  languageChoice,
  languageRedirect,
  publicRoute,
} from "../../server/shared/http/public-cache";
import { t } from "../../app/i18n";

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

it("names Taiwan's Chinese in full for browsers and search engines", () => {
  expect(languageTag("zh")).toBe("zh-TW");
  expect(languageTag("ko")).toBe("ko");
  expect(hreflang("tw", "zh")).toBe("zh-TW");
  expect(hreflang("kr", "ko")).toBe("ko-KR");
  expect(languageFor("tw", null)).toBe("zh");
  expect(languageFor("kr", "en")).toBe("en");
});
