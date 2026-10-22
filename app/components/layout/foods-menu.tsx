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
import { searchPath, useSiteChrome } from "../../lib/site-chrome";
import {
  currentNavigationGroup,
  groupCategories,
  navigationGroupPath,
} from "../../lib/navigation-groups";
import { useHydrated } from "../../lib/use-hydrated";
import { useMediaQuery } from "../../lib/use-media-query";

// Hover intent: a pointer crossing the button on its way elsewhere doesn't
// open the menu, and one leaving it briefly doesn't close it.
const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 300;
// A pointer crossing groups on its way to the foods doesn't switch them.
const GROUP_SWITCH_MS = 120;

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled])";

/**
 * Six presentation groups keep the header compact as countries add foods.
 * Pointer and keyboard previews use embedded data; clicking a group opens
 * its directory section. Without JavaScript, Foods opens the full directory.
 */
export function FoodsMenu() {
  const { country, aisles } = useSiteChrome();
  const hydrated = useHydrated();
  const desktop = useMediaQuery("(min-width: 760px)");
  const location = useLocation();
  const groups = groupCategories(aisles);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const preview = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const groupTimer = useRef<number | undefined>(undefined);
  // A mouse press opens the menu hover may already have opened, rather than
  // closing it again.
  const mousePress = useRef(false);

  // Open at the current page's group, or the first available group.
  const currentId = currentNavigationGroup(groups, location);
  const current = groups.find((group) => group.id === currentId) ?? groups[0];
  const shown = groups.find((group) => group.id === active) ?? current;

  const show = (next: boolean) => {
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(groupTimer.current);
    if (next && !open) setActive(current?.id ?? null);
    setOpen(next);
  };
  useEffect(() => {
    window.clearTimeout(hoverTimer.current);
    window.clearTimeout(groupTimer.current);
    setOpen(false);
  }, [location.key]);
  useEffect(
    () => () => {
      window.clearTimeout(hoverTimer.current);
      window.clearTimeout(groupTimer.current);
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

  if (!groups.length || !current) return null;
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
  const hoverGroup = (event: ReactPointerEvent, id: string | null) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(groupTimer.current);
    if (id)
      groupTimer.current = window.setTimeout(
        () => setActive(id),
        GROUP_SWITCH_MS,
      );
  };
  const close = () => {
    show(false);
    button.current?.focus();
  };
  const moveFocus = (index: number) => {
    const count = groups.length;
    const next = (index + count) % count;
    setActive(groups[next]!.id);
    links.current[next]?.focus();
  };
  const onGroupKey = (event: ReactKeyboardEvent, index: number) => {
    const moves: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: groups.length - 1,
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
                {groups.map((group, index) => {
                  const isShown = group.id === shown?.id;
                  return (
                    <li key={group.id}>
                      <Link
                        ref={(link) => {
                          links.current[index] = link;
                        }}
                        to={navigationGroupPath(country.code, group.id)}
                        discover="none"
                        // One group is in the Tab order; the arrow keys move
                        // between them and Tab moves on to its foods.
                        tabIndex={isShown ? 0 : -1}
                        className={`va-foods-menu__aisle${isShown ? " is-shown" : ""}`}
                        onFocus={() => setActive(group.id)}
                        onPointerEnter={(event) => hoverGroup(event, group.id)}
                        onPointerLeave={(event) => hoverGroup(event, null)}
                        onKeyDown={(event) => onGroupKey(event, index)}
                      >
                        <FoodIcon
                          slug={group.iconSlug}
                          size={20}
                          className="va-tag-icon"
                        />
                        <span>{group.name}</span>
                        <Icon name="chevronRight" size={14} strokeWidth={2.5} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div ref={preview} className="va-foods-menu__preview">
              <FoodNavigation
                key={shown!.id}
                country={country.code}
                group={shown!}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
