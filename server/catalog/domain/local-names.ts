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
  // The head words of Regulation 1169/2011 Annex II.
  de: {
    celery: "Sellerie",
    crustacean: "Krebstiere",
    egg: "Eier",
    fish: "Fische",
    gluten: "Glutenhaltiges Getreide",
    lupin: "Lupinen",
    milk: "Milch",
    mollusc: "Weichtiere",
    mustard: "Senf",
    peanut: "Erdnüsse",
    sesame: "Sesamsamen",
    soy: "Sojabohnen",
    sulphites: "Schwefeldioxid und Sulphite",
    tree_nuts: "Schalenfrüchte",
  },
  it: {
    celery: "Sedano",
    crustacean: "Crostacei",
    egg: "Uova",
    fish: "Pesce",
    gluten: "Cereali contenenti glutine",
    lupin: "Lupini",
    milk: "Latte",
    mollusc: "Molluschi",
    mustard: "Senape",
    peanut: "Arachidi",
    sesame: "Semi di sesamo",
    soy: "Soia",
    sulphites: "Anidride solforosa e solfiti",
    tree_nuts: "Frutta a guscio",
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
    AT: "Autriche",
    AU: "Australie",
    BE: "Belgique",
    CA: "Canada",
    CH: "Suisse",
    DE: "Allemagne",
    FR: "France",
    GB: "Royaume-Uni",
    IE: "Irlande",
    IN: "Inde",
    IT: "Italie",
    JP: "Japon",
    LU: "Luxembourg",
    NZ: "Nouvelle-Zélande",
    SG: "Singapour",
    US: "États-Unis",
    ZA: "Afrique du Sud",
  },
  de: {
    AT: "Österreich",
    AU: "Australien",
    BE: "Belgien",
    CA: "Kanada",
    CH: "Schweiz",
    DE: "Deutschland",
    FR: "Frankreich",
    GB: "Vereinigtes Königreich",
    IE: "Irland",
    IN: "Indien",
    IT: "Italien",
    JP: "Japan",
    LU: "Luxemburg",
    NZ: "Neuseeland",
    SG: "Singapur",
    US: "Vereinigte Staaten",
    ZA: "Südafrika",
  },
  it: {
    AT: "Austria",
    AU: "Australia",
    BE: "Belgio",
    CA: "Canada",
    CH: "Svizzera",
    DE: "Germania",
    FR: "Francia",
    GB: "Regno Unito",
    IE: "Irlanda",
    IN: "India",
    IT: "Italia",
    JP: "Giappone",
    LU: "Lussemburgo",
    NZ: "Nuova Zelanda",
    SG: "Singapore",
    US: "Stati Uniti",
    ZA: "Sudafrica",
  },
  ja: {
    AT: "オーストリア",
    AU: "オーストラリア",
    BE: "ベルギー",
    CA: "カナダ",
    CH: "スイス",
    DE: "ドイツ",
    FR: "フランス",
    GB: "イギリス",
    IE: "アイルランド",
    IN: "インド",
    IT: "イタリア",
    JP: "日本",
    LU: "ルクセンブルク",
    NZ: "ニュージーランド",
    SG: "シンガポール",
    US: "アメリカ",
    ZA: "南アフリカ",
  },
};

// Regulation 1169/2011 Annex II, where it differs from the Canadian names.
const EUROPEAN_FRENCH: Record<string, string> = {
  fish: "Poissons",
  gluten: "Céréales contenant du gluten",
  soy: "Soja",
  sulphites: "Anhydride sulfureux et sulfites",
  tree_nuts: "Fruits à coque",
};

// A country whose labels word an allergen differently from the shared language
// lists its own names here, by language and lowercase country code.
const MARKET_NAMES: Partial<
  Record<Language, Record<string, Record<string, string>>>
> = {
  de: { ch: { sulphites: "Schwefeldioxid und Sulfite" } },
  fr: {
    fr: EUROPEAN_FRENCH,
    be: EUROPEAN_FRENCH,
    lu: EUROPEAN_FRENCH,
    ch: { ...EUROPEAN_FRENCH, tree_nuts: "Fruits à coque dure" },
  },
};

// The seeded rating questions, by key. A question an operator adds has no entry
// and shows as written.
const QUESTIONS: Partial<Record<Language, Record<string, string>>> = {
  fr: {
    baking: "En pâtisserie",
    browning: "Dorure",
    creaminess: "Onctuosité",
    crispiness: "Croustillant",
    hot_drinks: "Dans les boissons chaudes",
    juiciness: "Jutosité",
    melt: "Fonte",
    riblets: "Côtes levées BBQ",
    scrambling: "Œufs brouillés",
    soyrizo: "Chorizo mexicain",
    spreading: "Tartinabilité",
    stretch: "Étirement",
    taste: "Goût",
    texture: "Texture",
  },
  de: {
    baking: "Beim Backen",
    browning: "Bräunung",
    creaminess: "Cremigkeit",
    crispiness: "Knusprigkeit",
    hot_drinks: "In heißen Getränken",
    juiciness: "Saftigkeit",
    melt: "Schmelzen",
    riblets: "BBQ-Rippchen",
    scrambling: "Als Rührei",
    soyrizo: "Mexikanische Chorizo",
    spreading: "Streichfähigkeit",
    stretch: "Fadenziehen",
    taste: "Geschmack",
    texture: "Textur",
  },
  it: {
    baking: "In forno",
    browning: "Doratura",
    creaminess: "Cremosità",
    crispiness: "Croccantezza",
    hot_drinks: "Nelle bevande calde",
    juiciness: "Succosità",
    melt: "Scioglievolezza",
    riblets: "Costine BBQ",
    scrambling: "Strapazzate",
    soyrizo: "Chorizo messicano",
    spreading: "Spalmabilità",
    stretch: "Filatura",
    taste: "Gusto",
    texture: "Consistenza",
  },
  ja: {
    baking: "お菓子作りでの使い勝手",
    browning: "焼き色",
    creaminess: "クリーミーさ",
    crispiness: "サクサク感",
    hot_drinks: "温かい飲み物での使い勝手",
    juiciness: "ジューシーさ",
    melt: "溶け具合",
    riblets: "BBQリブ",
    scrambling: "スクランブルエッグ",
    soyrizo: "メキシカンチョリソー",
    spreading: "塗りやすさ",
    stretch: "伸び",
    taste: "味",
    texture: "食感",
  },
};

const EUROPEAN_FRENCH_QUESTIONS: Record<string, string> = {
  riblets: "Travers BBQ",
  stretch: "Filant",
};
const MARKET_QUESTIONS: Partial<
  Record<Language, Record<string, Record<string, string>>>
> = {
  de: { ch: { hot_drinks: "In heissen Getränken" } },
  fr: {
    fr: EUROPEAN_FRENCH_QUESTIONS,
    be: EUROPEAN_FRENCH_QUESTIONS,
    lu: EUROPEAN_FRENCH_QUESTIONS,
    ch: EUROPEAN_FRENCH_QUESTIONS,
  },
};

export function questionLabel(key: string, label: string) {
  const language = pageLanguage() ?? "en";
  return (
    MARKET_QUESTIONS[language]?.[pageCountry() ?? ""]?.[key] ??
    QUESTIONS[language]?.[key] ??
    label
  );
}

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
