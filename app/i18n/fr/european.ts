import type { Dictionary, MarketText } from "..";
import { france } from "./france";
import { franceErrors } from "./france-errors";

type Message = string | { one: string; other: string };

// French in Europe spaces `; ! ?` from the word before; Quebec's rule doesn't.
const spacedText = (text: string) =>
  text.replace(/(?<![\s  !?])[;!?]+/g, " $&");

const spaced = (message: Message): Message =>
  typeof message === "string"
    ? spacedText(message)
    : { one: spacedText(message.one), other: spacedText(message.other) };

/** The override with the spacing applied, plus every shared entry it changes. */
function european<T extends Message>(
  shared: Record<string, T>,
  override: Record<string, T>,
) {
  return Object.fromEntries(
    Object.entries({ ...shared, ...override }).flatMap(([key, message]) => {
      const changed = spaced(message) as T;
      return JSON.stringify(changed) === JSON.stringify(shared[key])
        ? []
        : [[key, changed]];
    }),
  );
}

export function europeanMarkets(
  shared: Dictionary,
  sharedErrors: Record<string, string>,
) {
  const text = {
    messages: european(shared, france as Record<string, Message>),
    serverText: european(sharedErrors, franceErrors),
  };
  return {
    fr: { locale: "fr-FR", ...text },
    be: { locale: "fr-BE", ...text },
    lu: { locale: "fr-LU", ...text },
    ch: { locale: "fr-CH", ...text },
  } satisfies Record<string, MarketText>;
}
