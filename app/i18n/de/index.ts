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
  at: { locale: "de-AT" },
  lu: { locale: "de-LU" },
  ch: {
    locale: "de-CH",
    messages: swissGerman(de),
    serverText: swissGerman(errors),
  },
};
