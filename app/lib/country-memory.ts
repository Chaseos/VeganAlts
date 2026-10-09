import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { homePath } from "@server/catalog/domain/markets";
import { PREFERENCE_KEYS, readPreference } from "./device-preferences";
import { useSiteChrome } from "./site-chrome";

// "/" is the United States home. A visitor who chose another country before
// returns there after hydration; nothing is inferred from IP.
export function useRememberedCountry(onDefaultHome: boolean) {
  const navigate = useNavigate();
  const { countries } = useSiteChrome();
  const done = useRef(false);
  useEffect(() => {
    if (!onDefaultHome || done.current) return;
    done.current = true;
    const saved = readPreference(PREFERENCE_KEYS.country);
    if (saved && saved !== "us" && countries.some((c) => c.code === saved))
      void navigate(homePath(saved), { replace: true });
  }, [onDefaultHome, countries, navigate]);
}
