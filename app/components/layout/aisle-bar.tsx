import { useEffect, useRef, useState } from "react";
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

// The header's second row. Without JavaScript and on phones each aisle is a
// link to its aisle page (the bar scrolls sideways). On desktop, once
// hydrated, each aisle opens a menu of its shelves and foods with their top
// three, read from that aisle page's cached data.
export function AisleBar() {
  const { country, aisles } = useSiteChrome();
  const hydrated = useHydrated();
  const desktop = useMediaQuery("(min-width: 760px)");
  const [open, setOpen] = useState<string | null>(null);
  const location = useLocation();
  useEffect(() => setOpen(null), [location.key]);
  if (!aisles.length) return null;
  const menus = hydrated && desktop;
  return (
    <nav className="va-aisle-bar" aria-label="Aisles">
      <ul>
        {aisles.map((aisle) => (
          <li key={aisle.slug}>
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
        onFocus={prefetch}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            onToggle(false);
          }
        }}
        onClick={() => {
          prefetch();
          onToggle(!open);
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
                  shelves: aisle.shelves.map((shelf) => ({
                    slug: shelf.slug,
                    name: shelf.name,
                    foods: shelf.foods.map((food) => ({
                      ...food,
                      rankedCount: 0,
                      top: [],
                    })),
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
