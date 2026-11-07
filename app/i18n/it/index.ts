import type { Dictionary, MarketText } from "..";
import { browse } from "./browse";
import { chrome } from "./chrome";
import { codes } from "./codes";
import { contribute } from "./contribute";
import { errors } from "./errors";
import { product } from "./product";

export { errors };

// Italian. Terms and rules: docs/operations/translation-glossary.md
export const it: Dictionary = {
  ...chrome,
  ...codes,
  ...browse,
  ...product,
  ...contribute,
};

export const markets: Record<string, MarketText> = {
  ch: { locale: "it-CH" },
};
