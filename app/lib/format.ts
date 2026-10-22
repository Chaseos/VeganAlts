// Presentation formatting shared by every surface. Rendering never reads the
// clock; anything time-relative is decided by the loader.

/** Keep public titles identifiable without repeating a brand already in the name. */
export function productName(name: string, brand: string | null) {
  const title = name.trim();
  const prefix = brand?.trim();
  if (!prefix) return title;
  const words = (value: string) =>
    value
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(" ") ?? "";
  const named = words(title);
  const branded = words(prefix);
  return branded && (named === branded || named.startsWith(`${branded} `))
    ? title
    : `${prefix} ${title}`;
}

export function formatScore(value: number) {
  return value.toFixed(1);
}

export function formatCount(value: number) {
  return value.toLocaleString("en-US");
}

export function plural(count: number, one: string, many = `${one}s`) {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

// "Target", "Target, Kroger", "Target + 2 more"
export function summarizeNames(names: string[], max = 2) {
  if (names.length <= max) return names.join(", ");
  return `${names[0]} + ${names.length - 1} more`;
}

// "soy", "soy and wheat", "soy, wheat and sesame"
export function joinList(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "an eggnog", "a cheddar": the indefinite article by the first letter. */
export function withArticle(noun: string) {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

export function lowerFirst(value: string) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

// "Oct 2": fixed locale and time zone so cached HTML and hydration agree.
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
export function shortDate(timestamp: number) {
  return SHORT_DATE.format(new Date(timestamp));
}
