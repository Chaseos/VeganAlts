import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useLocation } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { FoodNavigation } from "./food-navigation";
import { foodPath, searchPath, useSiteChrome } from "../../lib/site-chrome";
import { useHydrated } from "../../lib/use-hydrated";
import { useMediaQuery } from "../../lib/use-media-query";

// Hover intent: a pointer crossing the button on its way elsewhere doesn't
// open the menu, and one leaving it briefly doesn't close it.
const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 300;
// A pointer crossing aisles on its way to the foods doesn't switch them.
const AISLE_SWITCH_MS = 120;

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";

/**
 * The desktop Foods menu (owner decision, 2026-10-12). One button in the
 * header row opens every aisle, and the aisle under the pointer or keyboard
 * focus shows its food types from the embedded navigation tree, so the header
 * keeps one row however many aisles a country has. A mouse opens it on hover;
 * touch and the keyboard open it on press, and the arrow keys move between
 * aisles. Without JavaScript the button links to the page listing every
 * aisle. Phones keep the aisle chips under the header (AisleBar).
 */
export function FoodsMenu() {
  const { country, aisles } = useSiteChrome();
  const hydrated = useHydrated();
  const desktop = useMediaQuery("(min-width: 760px)");
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const preview = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const aisleTimer = useRef<number | undefined>(undefined);
  // A mouse press opens the menu hover may already have opened, rather than
  // closing it again.
  const mousePress = useRef(false);

  // The aisle of the page being viewed shows first.
  const segment = location.pathname.split("/")[2] ?? "";
  const food = new URLSearchParams(location.search).get("food") ?? "";
  const current =
    aisles.find(
      (aisle) =>
        aisle.slug === segment ||
        aisle.foods.some((f) => f.slug === segment || f.slug === food),
    ) ?? aisles[0];
  const shown = aisles.find((aisle) => aisle.slug === active) ?? current;

  const show = (next: boolean) => {
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(aisleTimer.current);
    if (next && !open) setActive(current?.slug ?? null);
    setOpen(next);
  };
  useEffect(() => {
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(aisleTimer.current);
    setOpen(false);
  }, [location.key]);
  useEffect(
    () => () => {
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(aisleTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  if (!aisles.length || !current) return null;
  const label = (
    <>
      <Icon name="grid" size={18} className="va-tag-icon" />
      <span>Foods</span>
      <Icon name="chevronDown" size={12} strokeWidth={3} />
    </>
  );
  if (!(hydrated && desktop))
    return (
      <Link className="va-foods__button" to={searchPath(country.code)}>
        {label}
      </Link>
    );

  const hover = (event: ReactPointerEvent, next: boolean) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    if (next === open) return;
    hoverTimer.current = window.setTimeout(
      () => show(next),
      next ? HOVER_OPEN_MS : HOVER_CLOSE_MS,
    );
  };
  const hoverAisle = (event: ReactPointerEvent, slug: string | null) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(aisleTimer.current);
    if (slug)
      aisleTimer.current = window.setTimeout(
        () => setActive(slug),
        AISLE_SWITCH_MS,
      );
  };
  const close = () => {
    show(false);
    button.current?.focus();
  };
  const moveFocus = (index: number) => {
    const count = aisles.length;
    const next = (index + count) % count;
    setActive(aisles[next]!.slug);
    links.current[next]?.focus();
  };
  const onAisleKey = (event: ReactKeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: aisles.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      moveFocus(moves[event.key]!);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      preview.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }
  };

  return (
    <div
      ref={root}
      className="va-foods"
      onPointerEnter={(event) => hover(event, true)}
      onPointerLeave={(event) => hover(event, false)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          close();
        }
      }}
      onBlur={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && !root.current?.contains(next)) show(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="va-foods__button"
        aria-expanded={open}
        aria-controls="foods-menu"
        onPointerDown={(event) => {
          mousePress.current = event.pointerType === "mouse";
        }}
        onClick={() => {
          show(mousePress.current || !open);
          mousePress.current = false;
        }}
      >
        {label}
      </button>
      {open && (
        <div
          id="foods-menu"
          className="va-foods-menu"
          role="region"
          aria-label="Foods"
        >
          <div className="va-foods-menu__inner">
            <div className="va-foods-menu__categories">
              <h2 className="va-overline">Categories</h2>
              <ul className="va-foods-menu__aisles" aria-label="Categories">
                {aisles.map((aisle, index) => {
                  const isShown = aisle.slug === shown?.slug;
                  return (
                    <li key={aisle.slug}>
                      <Link
                        ref={(link) => {
                          links.current[index] = link;
                        }}
                        to={foodPath(country.code, aisle.slug)}
                        discover="none"
                        // One aisle is in the Tab order; the arrow keys move
                        // between them and Tab moves on to its foods.
                        tabIndex={isShown ? 0 : -1}
                        className={`va-foods-menu__aisle${isShown ? " is-shown" : ""}`}
                        onFocus={() => setActive(aisle.slug)}
                        onPointerEnter={(event) =>
                          hoverAisle(event, aisle.slug)
                        }
                        onPointerLeave={(event) => hoverAisle(event, null)}
                        onKeyDown={(event) => onAisleKey(event, index)}
                      >
                        <FoodIcon
                          slug={aisle.slug}
                          size={20}
                          className="va-tag-icon"
                        />
                        <span>{aisle.name}</span>
                        <Icon name="chevronRight" size={14} strokeWidth={2.5} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div ref={preview} className="va-foods-menu__preview">
              <FoodNavigation
                key={shown!.slug}
                country={country.code}
                category={shown!}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
