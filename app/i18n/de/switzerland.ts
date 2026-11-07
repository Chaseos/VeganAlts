type Message = string | { one: string; other: string };

const swissText = (text: string) =>
  text.replaceAll("ß", "ss").replace(/„([^“]*)“/g, "«$1»");

const swiss = (message: Message): Message =>
  typeof message === "string"
    ? swissText(message)
    : { one: swissText(message.one), other: swissText(message.other) };

/**
 * Swiss Standard German differs from the shared text in its spelling and
 * quotes, so only the entries those change are kept.
 */
export function swissGerman<T extends Message>(text: Record<string, T>) {
  return Object.fromEntries(
    Object.entries(text).flatMap(([key, message]) => {
      const changed = swiss(message) as T;
      return JSON.stringify(changed) === JSON.stringify(message)
        ? []
        : [[key, changed]];
    }),
  );
}
