import { useCallback } from "react";
import {
  PREFERENCE_KEYS,
  usePreferenceValue,
  writePreference,
} from "./device-preferences";

export type ThemeChoice = "system" | "light" | "dark";

// Browser chrome color: the kale header in each theme. Kept equal to
// --va-kale in app/styles/tokens.css (checked by tests/unit/design-tokens).
export const THEME_COLORS = { light: "#12372a", dark: "#163a2c" } as const;

// Runs before first paint, so a chosen theme never flashes. It is inline (with
// the per-request nonce) and must not depend on anything else on the page.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(PREFERENCE_KEYS.theme)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export function parseTheme(value: string | null): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

export function useTheme() {
  const theme = parseTheme(usePreferenceValue(PREFERENCE_KEYS.theme));
  const setTheme = useCallback((choice: ThemeChoice) => {
    applyTheme(choice);
    writePreference(PREFERENCE_KEYS.theme, choice === "system" ? null : choice);
  }, []);
  return [theme, setTheme] as const;
}

export const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
