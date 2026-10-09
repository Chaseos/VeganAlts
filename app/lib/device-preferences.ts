import { useCallback, useSyncExternalStore } from "react";

// Preferences that stay on this device. Public pages are cached once for
// everyone, so these never reach the server except as normalized query
// parameters, and they apply only after hydration (the server snapshot is
// always the default).
export const PREFERENCE_KEYS = {
  theme: "veganalts.theme.v1",
  country: "veganalts.country.v1",
  stores: "veganalts.stores.v1",
  freeFrom: "veganalts.free-from.v1",
} as const;

const EVENT = "veganalts:preferences";

export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePreference(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key.startsWith("veganalts.")) callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

// Raw string snapshots are stable, so parsing happens after the store read.
export function usePreferenceValue(key: string) {
  return useSyncExternalStore(
    subscribe,
    () => readPreference(key),
    () => null,
  );
}

// Per-country lists ({"us": ["target"]}) for stores and Free-from allergens.
export function readCountryList(key: string, country: string): string[] {
  return parseCountryList(readPreference(key), country);
}

export function parseCountryList(raw: string | null, country: string) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const list = value?.[country];
    return Array.isArray(list)
      ? list.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function writeCountryList(key: string, country: string, list: string[]) {
  let value: Record<string, string[]> = {};
  try {
    value = JSON.parse(readPreference(key) ?? "{}") ?? {};
  } catch {
    value = {};
  }
  value[country] = list;
  writePreference(key, JSON.stringify(value));
}

export function useCountryList(key: string, country: string) {
  const raw = usePreferenceValue(key);
  const list = parseCountryList(raw, country);
  const set = useCallback(
    (next: string[]) => writeCountryList(key, country, next),
    [key, country],
  );
  return [list, set, raw !== null] as const;
}
