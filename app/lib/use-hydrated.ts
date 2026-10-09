import { useSyncExternalStore } from "react";

const noop = () => () => {};

// False for the server render and the hydration pass, true afterwards. Use it
// to keep the first client render identical to cached HTML.
export function useHydrated() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
