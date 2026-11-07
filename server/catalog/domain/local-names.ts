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
  // NOM-051 4.2.2.2.3's words. Spain's differ, in MARKET_NAMES.
  es: {
    celery: "Apio",
    crustacean: "Crustáceos",
    egg: "Huevos",
    fish: "Pescado",
    gluten: "Cereales que contienen gluten",
    lupin: "Altramuces",
    milk: "Leche",
    mollusc: "Moluscos",
    mustard: "Mostaza",
    peanut: "Cacahuate",
    sesame: "Ajonjolí",
    soy: "Soya",
    sulphites: "Sulfito",
    tree_nuts: "Nueces de árboles",
    wheat: "Trigo",
  },
  // RDC 727 Annex III's words. Portugal's differ, in MARKET_NAMES.
  pt: {
    almond: "Amêndoa",
    barley: "Cevada",
    brazil_nut: "Castanha-do-brasil ou castanha-do-pará",
    cashew: "Castanha-de-caju",
    celery: "Aipo",
    chestnut: "Castanhas",
    crustacean: "Crustáceos",
    egg: "Ovos",
    fish: "Peixes",
    gluten: "Glúten",
    hazelnut: "Avelãs",
    latex: "Látex natural",
    lupin: "Tremoço",
    macadamia: "Macadâmias",
    milk: "Leite",
    mollusc: "Moluscos",
    mustard: "Mostarda",
    oats: "Aveia",
    peanut: "Amendoim",
    pecan: "Pecãs",
    pine_nut: "Pinoli",
    pistachio: "Pistaches",
    rye: "Centeio",
    sesame: "Gergelim",
    soy: "Soja",
    sulphites: "Sulfitos",
    tree_nuts: "Oleaginosas",
    walnut: "Nozes",
    wheat: "Trigo",
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
  es: {
    AU: "Australia",
    BR: "Brasil",
    CA: "Canadá",
    DE: "Alemania",
    ES: "España",
    FR: "Francia",
    GB: "Reino Unido",
    IE: "Irlanda",
    IN: "India",
    IT: "Italia",
    JP: "Japón",
    KR: "Corea del Sur",
    MX: "México",
    NZ: "Nueva Zelanda",
    PT: "Portugal",
    SG: "Singapur",
    TW: "Taiwán",
    US: "Estados Unidos",
    ZA: "Sudáfrica",
  },
  pt: {
    AU: "Austrália",
    BR: "Brasil",
    CA: "Canadá",
    DE: "Alemanha",
    ES: "Espanha",
    FR: "França",
    GB: "Reino Unido",
    IE: "Irlanda",
    IN: "Índia",
    IT: "Itália",
    JP: "Japão",
    KR: "Coreia do Sul",
    MX: "México",
    NZ: "Nova Zelândia",
    PT: "Portugal",
    SG: "Singapura",
    TW: "Taiwan",
    US: "Estados Unidos",
    ZA: "África do Sul",
  },
  fr: {
    AU: "Australie",
    BR: "Brésil",
    CA: "Canada",
    ES: "Espagne",
    GB: "Royaume-Uni",
    IE: "Irlande",
    IN: "Inde",
    JP: "Japon",
    MX: "Mexique",
    NZ: "Nouvelle-Zélande",
    PT: "Portugal",
    SG: "Singapour",
    US: "États-Unis",
    ZA: "Afrique du Sud",
  },
  ja: {
    AU: "オーストラリア",
    BR: "ブラジル",
    CA: "カナダ",
    ES: "スペイン",
    GB: "イギリス",
    IE: "アイルランド",
    IN: "インド",
    JP: "日本",
    MX: "メキシコ",
    NZ: "ニュージーランド",
    PT: "ポルトガル",
    SG: "シンガポール",
    US: "アメリカ",
    ZA: "南アフリカ",
  },
};

// A country whose labels word an allergen differently from the shared language
// lists its own names here, by language and lowercase country code.
const MARKET_NAMES: Partial<
  Record<Language, Record<string, Record<string, string>>>
> = {
  // EU 1169/2011 Annex II, in its Spanish and Portuguese texts.
  es: {
    es: {
      gluten: "Cereales que contengan gluten",
      peanut: "Cacahuetes",
      sesame: "Granos de sésamo",
      soy: "Soja",
      sulphites: "Dióxido de azufre y sulfitos",
      tree_nuts: "Frutos de cáscara",
    },
  },
  pt: {
    pt: {
      gluten: "Cereais que contêm glúten",
      peanut: "Amendoins",
      sesame: "Sementes de sésamo",
      sulphites: "Dióxido de enxofre e sulfitos",
      tree_nuts: "Frutos de casca rija",
    },
  },
};

// The seeded rating questions, by key. A question an operator adds has no entry
// and shows as written.
const QUESTIONS: Partial<Record<Language, Record<string, string>>> = {
  es: {
    baking: "Para hornear",
    browning: "Dorado",
    creaminess: "Cremosidad",
    crispiness: "Textura crujiente",
    hot_drinks: "En bebidas calientes",
    juiciness: "Jugosidad",
    melt: "Derretido",
    riblets: "Costillitas BBQ",
    scrambling: "Revuelto",
    soyrizo: "Chorizo mexicano",
    spreading: "Facilidad para untar",
    stretch: "Elasticidad",
    taste: "Sabor",
    texture: "Textura",
  },
  pt: {
    baking: "Para assar",
    browning: "Douramento",
    creaminess: "Cremosidade",
    crispiness: "Crocância",
    hot_drinks: "Em bebidas quentes",
    juiciness: "Suculência",
    melt: "Derretimento",
    riblets: "Costelinhas BBQ",
    scrambling: "Mexido",
    soyrizo: "Chorizo mexicano",
    spreading: "Facilidade de espalhar",
    stretch: "Elasticidade",
    taste: "Sabor",
    texture: "Textura",
  },
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
};
const MARKET_QUESTIONS: Partial<
  Record<Language, Record<string, Record<string, string>>>
> = {
  es: {
    es: {
      baking: "Para repostería",
      melt: "Fundido",
      riblets: "Costillas BBQ",
    },
  },
  pt: {
    pt: {
      baking: "Para cozer no forno",
      browning: "Alourado",
      crispiness: "Textura estaladiça",
      melt: "Capacidade de derreter",
      riblets: "Entrecosto BBQ",
      soyrizo: "Chouriço mexicano",
      spreading: "Facilidade de barrar",
    },
  },
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
