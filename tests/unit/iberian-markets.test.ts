import { afterEach, beforeAll, expect, it } from "vitest";
import { addDictionary, pageLocale, t } from "../../app/i18n";
import { en } from "../../app/i18n/en";
import {
  errors as spanishErrors,
  es,
  markets as spain,
} from "../../app/i18n/es";
import {
  errors as portugueseErrors,
  markets as portugal,
  pt,
} from "../../app/i18n/pt";
import { allergenName } from "../../server/catalog/domain/local-names";
import {
  readPageCountryFrom,
  readPageLanguageFrom,
} from "../../server/catalog/domain/markets";
import { defaultLanguage } from "../../server/catalog/domain/languages";
import { TAXONOMY_COUNTRIES } from "../../db/seed/taxonomy";
import { REVIEW_ALLERGENS } from "../../server/community/domain/allergens";

const placeholders = (message: unknown) =>
  [...JSON.stringify(message).matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1])
    .sort();
const view = (language: "es" | "pt", country: string) => {
  readPageLanguageFrom(() => language);
  readPageCountryFrom(() => country);
};

beforeAll(() => {
  addDictionary("es", es, spanishErrors, spain);
  addDictionary("pt", pt, portugueseErrors, portugal);
});
afterEach(() => {
  readPageLanguageFrom(() => null);
  readPageCountryFrom(() => null);
});

it("each market opens in its own language", () => {
  expect(defaultLanguage("mx")).toBe("es");
  expect(defaultLanguage("es")).toBe("es");
  expect(defaultLanguage("br")).toBe("pt");
  expect(defaultLanguage("pt")).toBe("pt");
});

it("each market's numbers and dates follow its own locale", () => {
  view("es", "mx");
  expect(pageLocale()).toBe("es-MX");
  view("es", "es");
  expect(pageLocale()).toBe("es-ES");
  view("pt", "br");
  expect(pageLocale()).toBe("pt-BR");
  view("pt", "pt");
  expect(pageLocale()).toBe("pt-PT");
});

it("each market names allergens in its own rule's words", () => {
  view("es", "mx");
  expect(allergenName("peanut", "Peanuts")).toBe("Cacahuate");
  expect(allergenName("soy", "Soy")).toBe("Soya");
  view("es", "es");
  expect(allergenName("peanut", "Peanuts")).toBe("Cacahuetes");
  expect(allergenName("tree_nuts", "Nuts")).toBe("Frutos de cáscara");
  view("pt", "br");
  expect(allergenName("peanut", "Peanuts")).toBe("Amendoim");
  expect(allergenName("latex", "Natural latex")).toBe("Látex natural");
  view("pt", "pt");
  expect(allergenName("peanut", "Peanuts")).toBe("Amendoins");
  expect(allergenName("tree_nuts", "Nuts")).toBe("Frutos de casca rija");
});

it("every allergen a market lists has a name in its language", () => {
  for (const [iso2, language, country] of [
    ["MX", "es", "mx"],
    ["ES", "es", "es"],
    ["BR", "pt", "br"],
    ["PT", "pt", "pt"],
  ] as const) {
    view(language, country);
    const list = TAXONOMY_COUNTRIES.find((entry) => entry.iso2 === iso2)!;
    for (const entry of list.allergens) {
      const key = typeof entry === "string" ? entry : entry[0];
      expect(allergenName(key, "missing"), `${iso2} ${key}`).not.toBe(
        "missing",
      );
    }
  }
});

it("the lists' sizes match the rules they follow", () => {
  const size = (iso2: string) =>
    TAXONOMY_COUNTRIES.find((entry) => entry.iso2 === iso2)!.allergens.length;
  expect(size("MX")).toBe(10);
  expect(size("ES")).toBe(14);
  expect(size("PT")).toBe(14);
  // 18 entries, with four cereals apart, plus Law 10.674's gluten statement.
  expect(size("BR")).toBe(22);
  expect(REVIEW_ALLERGENS).not.toContain("latex");
});

it("overrides win, and a key left out falls through to the shared text", () => {
  view("pt", "pt");
  expect(t("menu.signIn")).toBe("Iniciar sessão");
  view("pt", "br");
  expect(t("menu.signIn")).toBe("Entrar");
});

it("every message keeps English's placeholders", () => {
  const dictionaries = {
    es,
    pt,
    spain: spain.es!.messages!,
    portugal: portugal.pt!.messages!,
  };
  for (const [name, dictionary] of Object.entries(dictionaries))
    for (const [key, message] of Object.entries(dictionary))
      expect(placeholders(message), `${name} ${key}`).toEqual(
        placeholders(en[key as keyof typeof en]),
      );
});
