import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router";

// Popovers are native <details> elements, so they open and close before
// hydration and without JavaScript. Once hydrated they close on Escape
// (returning focus to their summary), on an outside pointer press, when focus
// leaves them and on navigation, and only one is open at a time.
let openDisclosure: HTMLDetailsElement | null = null;

export function useDisclosure() {
  const ref = useRef<HTMLDetailsElement>(null);
  const location = useLocation();

  const close = useCallback((returnFocus = false) => {
    const element = ref.current;
    if (!element?.open) return;
    element.open = false;
    if (returnFocus)
      element.querySelector<HTMLElement>(":scope > summary")?.focus();
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const onToggle = () => {
      if (element.open) {
        if (openDisclosure && openDisclosure !== element)
          openDisclosure.open = false;
        openDisclosure = element;
      } else if (openDisclosure === element) openDisclosure = null;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !element.open) return;
      event.stopPropagation();
      close(true);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (element.open && !element.contains(event.target as Node)) close();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (element.open && next && !element.contains(next)) close();
    };
    element.addEventListener("toggle", onToggle);
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      element.removeEventListener("toggle", onToggle);
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown);
      if (openDisclosure === element) openDisclosure = null;
    };
  }, [close]);

  useEffect(() => {
    close();
  }, [location.key, close]);

  return { ref, close };
}
