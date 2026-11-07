import type { Dictionary, MarketText } from "..";
import { browse } from "./browse";
import { chrome } from "./chrome";
import { codes } from "./codes";
import { contribute } from "./contribute";
import { errors } from "./errors";
import { product } from "./product";
import { swissGerman } from "./switzerland";

export { errors };

// German. Terms and rules: docs/operations/translation-glossary.md
export const de: Dictionary = {
  ...chrome,
  ...codes,
  ...browse,
  ...product,
  ...contribute,
};

export const markets: Record<string, MarketText> = {
  de: { locale: "de-DE", inCountry: "in Deutschland" },
  at: {
    locale: "de-AT",
    inCountry: "in Österreich",
    messages: { "search.placeholder": "Faschiertes, Cheddar, Eier …" },
  },
  lu: { locale: "de-LU", inCountry: "in Luxemburg" },
  ch: {
    locale: "de-CH",
    inCountry: "in der Schweiz",
    messages: swissGerman(de),
    serverText: swissGerman(errors),
  },
};
