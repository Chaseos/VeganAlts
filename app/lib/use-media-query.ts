import { useSyncExternalStore } from "react";

// False on the server and during hydration, so cached HTML always matches the
// phone-first markup; desktop enhancements switch on afterwards.
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (callback) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", callback);
      return () => list.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
