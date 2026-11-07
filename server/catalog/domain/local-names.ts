import { pageCountry, pageLanguage } from "./markets";
import type { Language } from "./languages";

// Each country's wording for its own labels is in `country_allergens`, in
// English. These are the same allergens in the page's language. Canadian French
// follows Health Canada's source names.
const NAMES: Partial<Record<Language, Record<string, string>>> = {
  fr: {
    celery: "Céleri",
    crustacean: "Crustacés",
    egg: "Œufs",
    fish: "Poisson",
    gluten: "Gluten",
    lupin: "Lupin",
    milk: "Lait",
    mollusc: "Mollusques",
    mustard: "Moutarde",
    peanut: "Arachides",
    sesame: "Graines de sésame",
    soy: "Soya",
    sulphites: "Sulfites",
    tree_nuts: "Noix",
    wheat: "Blé",
  },
  // The Consumer Affairs Agency's item names.
  ja: {
    abalone: "あわび",
    almond: "アーモンド",
    apple: "りんご",
    banana: "バナナ",
    beef: "牛肉",
    buckwheat: "そば",
    cashew: "カシューナッツ",
    chicken: "鶏肉",
    crab: "かに",
    egg: "卵",
    gelatin: "ゼラチン",
    kiwi: "キウイフルーツ",
    macadamia: "マカダミアナッツ",
    mackerel: "さば",
    milk: "乳",
    orange: "オレンジ",
    peach: "もも",
    peanut: "落花生",
    pistachio: "ピスタチオ",
    pork: "豚肉",
    salmon: "さけ",
    salmon_roe: "いくら",
    sesame: "ごま",
    shrimp: "えび",
    soy: "大豆",
    squid: "いか",
    walnut: "くるみ",
    wheat: "小麦",
    yam: "やまいも",
  },
};

const COUNTRIES: Partial<Record<Language, Record<string, string>>> = {
  fr: {
    AU: "Australie",
    CA: "Canada",
    GB: "Royaume-Uni",
    IE: "Irlande",
    IN: "Inde",
    JP: "Japon",
    NZ: "Nouvelle-Zélande",
    SG: "Singapour",
    US: "États-Unis",
    ZA: "Afrique du Sud",
  },
  ja: {
    AU: "オーストラリア",
    CA: "カナダ",
    GB: "イギリス",
    IE: "アイルランド",
    IN: "インド",
    JP: "日本",
    NZ: "ニュージーランド",
    SG: "シンガポール",
    US: "アメリカ",
    ZA: "南アフリカ",
  },
};

// A country whose labels word an allergen differently from the shared language
// lists its own names here, by language and lowercase country code.
const MARKET_NAMES: Partial<
  Record<Language, Record<string, Record<string, string>>>
> = {};

export function countryName(iso2: string, name: string) {
  return COUNTRIES[pageLanguage() ?? "en"]?.[iso2] ?? name;
}

export function allergenName(key: string, label: string) {
  const language = pageLanguage() ?? "en";
  return (
    MARKET_NAMES[language]?.[pageCountry() ?? ""]?.[key] ??
    NAMES[language]?.[key] ??
    label
  );
}
