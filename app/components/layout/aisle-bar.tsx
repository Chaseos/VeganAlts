import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { NavLink, useFetcher, useLocation } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { AislePanel, type AisleData } from "../catalog/aisle-panel";
import {
  foodPath,
  useSiteChrome,
  type ChromeAisle,
} from "../../lib/site-chrome";
import { useHydrated } from "../../lib/use-hydrated";
import { useMediaQuery } from "../../lib/use-media-query";

// Hover intent: a pointer crossing the bar on its way to an open menu doesn't
// switch aisles, and one leaving it briefly doesn't close the menu.
const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 300;

// The header's second row. Without JavaScript and on phones each aisle is a
// link to its aisle page (the bar scrolls sideways). On desktop, once
// hydrated, each aisle opens a menu of its foods with their top
// three, read from that aisle page's cached data. A mouse opens it on hover
// (owner decision, 2026-10-12); touch and the keyboard open it on press.
export function AisleBar() {
  const { country, aisles } = useSiteChrome();
  const hydrated = useHydrated();
  const desktop = useMediaQuery("(min-width: 760px)");
  const [open, setOpen] = useState<string | null>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const location = useLocation();
  useEffect(() => {
    window.clearTimeout(hoverTimer.current);
    setOpen(null);
  }, [location.key]);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  if (!aisles.length) return null;
  const menus = hydrated && desktop;
  const hover = (event: ReactPointerEvent, slug: string | null) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(
      () => setOpen(slug),
      slug ? HOVER_OPEN_MS : HOVER_CLOSE_MS,
    );
  };
  return (
    <nav className="va-aisle-bar" aria-label="Aisles">
      <ul>
        {aisles.map((aisle) => (
          <li
            key={aisle.slug}
            // The menu is inside the item, so moving onto it keeps it open.
            onPointerEnter={
              menus ? (event) => hover(event, aisle.slug) : undefined
            }
            onPointerLeave={menus ? (event) => hover(event, null) : undefined}
          >
            {menus ? (
              <AisleMenuItem
                country={country.code}
                aisle={aisle}
                open={open === aisle.slug}
                onToggle={(next) => setOpen(next ? aisle.slug : null)}
              />
            ) : (
              <NavLink
                to={foodPath(country.code, aisle.slug)}
                prefetch="intent"
              >
                <FoodIcon slug={aisle.slug} size={20} className="va-tag-icon" />
                <span>{aisle.name}</span>
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AisleMenuItem({
  country,
  aisle,
  open,
  onToggle,
}: {
  country: string;
  aisle: ChromeAisle;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const fetcher = useFetcher<{ kind: string } & Partial<AisleData>>({
    key: `aisle:${country}:${aisle.slug}`,
  });
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // A mouse press opens the menu hover may already have opened, rather than
  // closing it again.
  const mousePress = useRef(false);
  const href = foodPath(country, aisle.slug);
  const prefetch = () => {
    if (fetcher.state === "idle" && !fetcher.data) void fetcher.load(href);
  };
  const close = (returnFocus: boolean) => {
    onToggle(false);
    if (returnFocus) button.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target))
        onToggle(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, onToggle]);
  const data =
    fetcher.data?.kind === "aisle" ? (fetcher.data as AisleData) : null;
  const id = `aisle-menu-${aisle.slug}`;
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onPointerEnter={prefetch}
        onPointerDown={(event) => {
          mousePress.current = event.pointerType === "mouse";
        }}
        onFocus={prefetch}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            onToggle(false);
          }
        }}
        onClick={() => {
          prefetch();
          onToggle(mousePress.current || !open);
          mousePress.current = false;
        }}
      >
        <FoodIcon slug={aisle.slug} size={20} className="va-tag-icon" />
        <span>{aisle.name}</span>
        <Icon name="chevronDown" size={12} strokeWidth={3} />
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          className="va-aisle-menu"
          role="region"
          aria-label={`${aisle.name} aisle`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close(true);
            }
          }}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (
              next &&
              !panel.current?.contains(next) &&
              next !== button.current
            )
              onToggle(false);
          }}
        >
          <div className="va-aisle-menu__inner">
            {data ? (
              <AislePanel
                country={country}
                data={data}
                mode="menu"
                headingLevel={2}
              />
            ) : (
              <AislePanel
                country={country}
                mode="menu"
                headingLevel={2}
                loading
                data={{
                  aisle: { slug: aisle.slug, name: aisle.name },
                  // Names and counts from the header data until the top
                  // products arrive.
                  foods: aisle.foods.map((food) => ({
                    ...food,
                    rankedCount: 0,
                    top: [],
                  })),
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
