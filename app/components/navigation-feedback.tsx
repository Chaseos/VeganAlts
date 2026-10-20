import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigation, useNavigationType } from "react-router";

export function NavigationFeedback() {
  const location = useLocation();
  const navigation = useNavigation();
  const type = useNavigationType();
  const previous = useRef(location);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const control = useRef<{
    id: string;
    text: string | null;
    label: string | null;
    filter: string | null;
  } | null>(null);
  useEffect(() => {
    if (navigation.state === "idle") {
      setPending(false);
      return;
    }
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active.closest(".va-filter-bar, .va-tabs")
    )
      control.current = {
        id: active.id,
        text: active.textContent,
        label: active.getAttribute("aria-label"),
        filter:
          ["va-sort-menu", "va-free-menu", "va-store-menu"].find((name) =>
            active.closest(`.${name}`),
          ) ?? null,
      };
    const timer = setTimeout(() => setPending(true), 150);
    return () => clearTimeout(timer);
  }, [navigation.state]);
  useLayoutEffect(() => {
    const last = previous.current;
    previous.current = location;
    if (last.key === location.key) return;
    setMessage(
      document.querySelector("main h1")?.textContent ?? "Page loaded.",
    );
    // POP restores cached rows and the browser's position, without stealing focus.
    if (type === "POP") {
      control.current = null;
      return;
    }
    let target: HTMLElement | null = null;
    if (location.hash) {
      try {
        target = document.getElementById(
          decodeURIComponent(location.hash.slice(1)),
        );
      } catch {
        /* malformed fragments are ignored */
      }
      const disclosure = target?.closest("details");
      if (disclosure) disclosure.open = true;
    } else if (last.pathname === location.pathname && control.current) {
      const saved = control.current;
      target =
        (saved.filter &&
          document.querySelector<HTMLElement>(`.${saved.filter} > summary`)) ||
        (saved.id && document.getElementById(saved.id)) ||
        Array.from(
          document.querySelectorAll<HTMLElement>(
            ".va-filter-bar summary, .va-filter-bar button, .va-filter-bar a, .va-filter-bar input, .va-tabs a",
          ),
        ).find((element) =>
          saved.label
            ? element.getAttribute("aria-label") === saved.label
            : element.textContent === saved.text,
        ) ||
        null;
    } else if (
      last.pathname !== location.pathname ||
      new URLSearchParams(last.search).get("q") !==
        new URLSearchParams(location.search).get("q")
    ) {
      target = document.querySelector<HTMLElement>("main h1, #main");
    }
    // Other changes within a page (including contribution steps) own their
    // focus. A delayed route commit must not override the step heading.
    control.current = null;
    if (target) {
      if (!target.matches("a, button, input, select, textarea, summary"))
        target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
    if (type === "PUSH" && last.pathname !== location.pathname) {
      const main = document.querySelector("main");
      main?.classList.remove("va-page-enter");
      main?.classList.add("va-page-enter");
    }
  }, [location, type]);
  return (
    <>
      {pending && (
        <div className="va-route-pending" aria-hidden="true">
          Loading…
        </div>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {pending ? "Loading page…" : message}
      </p>
    </>
  );
}
