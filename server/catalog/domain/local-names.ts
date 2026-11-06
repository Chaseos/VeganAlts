import { pageLanguage } from "./markets";
import type { Language } from "./languages";

// Each country's wording for its own labels is in `country_allergens`, in
// English. These are the same allergens in the page's language. Canadian French
// follows Health Canada's source names, and a person reviews it per market.
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
};

export function countryName(iso2: string, name: string) {
  return COUNTRIES[pageLanguage() ?? "en"]?.[iso2] ?? name;
}

export function allergenName(key: string, label: string) {
  return NAMES[pageLanguage() ?? "en"]?.[key] ?? label;
}
