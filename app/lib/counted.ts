import { t, type MessageKey } from "../i18n";
import { formatCount } from "./format";

/** A counted noun from a plural entry: `{number}` is the count in the page's digits. */
export function counted(
  key: MessageKey,
  count: number,
  values: Record<string, string | number> = {},
) {
  return t(key, { ...values, count, number: formatCount(count) });
}
