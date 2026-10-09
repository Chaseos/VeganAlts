import { Form, Link, useLocation, useNavigate } from "react-router";
import type { RankingFilters } from "@server/catalog/domain/filters";
import type {
  FilterOption,
  StoreOption,
} from "@server/catalog/domain/contracts";
import { Icon } from "../icons/icon";
import { Popover } from "../ui/popover";
import { formatCount, plural, summarizeNames } from "../../lib/format";
import { filteredHref, saveFilters } from "../../lib/ranking-filters";

export interface SortOption {
  view: string;
  label: string;
  hint: string;
}

// One control for every way of ordering a food's products. Only Closest match
// is the ranking; the others reorder without changing it.
export function SortMenu({
  options,
  current,
}: {
  options: SortOption[];
  current: string;
}) {
  const location = useLocation();
  const label = options.find((option) => option.view === current)?.label;
  const href = (view: string) => {
    const params = new URLSearchParams(location.search);
    params.delete("page");
    params.delete("unrankedPage");
    if (view === "top") params.delete("view");
    else params.set("view", view);
    params.sort();
    return `${location.pathname}${params.size ? `?${params}` : ""}`;
  };
  return (
    <Popover
      className="va-sort-menu"
      summaryLabel={`Sort: ${label}`}
      panelLabel="Sort by"
      summary={
        <>
          <span className="va-muted">Sort</span>
          <strong>{label}</strong>
          <Icon name="chevronDown" size={14} strokeWidth={2.6} />
        </>
      }
    >
      {(close) => (
        <>
          <ul className="va-menu-list">
            {options.map((option) => {
              const selected = option.view === current;
              return (
                <li key={option.view}>
                  <Link
                    to={href(option.view)}
                    aria-current={selected ? "true" : undefined}
                    preventScrollReset
                    onClick={() => close()}
                  >
                    <span className="va-menu-check" aria-hidden="true">
                      {selected && (
                        <Icon name="check" size={16} strokeWidth={3} />
                      )}
                    </span>
                    <span className="va-sort-menu__label">{option.label}</span>
                    <span className="va-sort-menu__hint">{option.hint}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="va-menu-note">
            Only Closest match is the ranking. Other sorts never change it.
          </p>
        </>
      )}
    </Popover>
  );
}

// "Commonly found at": every store members report in this country, with its
// number of ranked swaps in the food. Several stores combine with OR. Works as
// a plain GET form without JavaScript; with it, the choice is saved on the
// device for this country.
export function StoreChecklist({
  country,
  stores,
  filters,
}: {
  country: string;
  stores: StoreOption[];
  filters: RankingFilters;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const chosen = new Set(filters.stores);
  const names = stores
    .filter((store) => chosen.has(store.slug))
    .map((store) => store.name);
  // Stores with ranked swaps here, plus any already chosen.
  const visible = stores.filter(
    (store) => store.count > 0 || chosen.has(store.slug),
  );
  const apply = (next: string[]) => {
    const value = { ...filters, stores: [...new Set(next)].sort() };
    saveFilters(country, value);
    void navigate(filteredHref(location.pathname, location.search, value), {
      preventScrollReset: true,
    });
  };
  const params = new URLSearchParams(location.search);
  return (
    <Popover
      className={`va-store-menu${chosen.size ? " va-store-menu--active" : ""}`}
      summaryLabel={`Commonly found at: ${names.length ? names.join(", ") : "Any store"}`}
      panelLabel="Stores you shop at"
      summary={
        <>
          <Icon name="bag" size={18} />
          <span className="va-store-menu__lead">Commonly found at</span>
          <strong>{names.length ? summarizeNames(names) : "Any store"}</strong>
          <Icon name="chevronDown" size={14} strokeWidth={2.6} />
        </>
      }
    >
      {(close) => (
        <Form
          key={filters.stores.join(",")}
          method="get"
          action={location.pathname}
          preventScrollReset
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            apply(data.getAll("stores").map(String));
            close(true);
          }}
        >
          {params.get("view") && (
            <input type="hidden" name="view" value={params.get("view")!} />
          )}
          {filters.freeFrom.length > 0 && (
            <input
              type="hidden"
              name="freeFrom"
              value={filters.freeFrom.join(",")}
            />
          )}
          <p className="va-menu-heading">Pick every store you shop at</p>
          {visible.length ? (
            <ul className="va-check-list">
              {visible.map((store) => (
                <li key={store.slug}>
                  <label>
                    <input
                      type="checkbox"
                      name="stores"
                      value={store.slug}
                      defaultChecked={chosen.has(store.slug)}
                    />
                    <span className="va-check-list__name">{store.name}</span>
                    <span className="va-check-list__count">
                      {plural(store.count, "swap")}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="va-menu-note">
              No stores have been reported for these swaps in this country yet.
            </p>
          )}
          <div className="va-check-list__actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                apply([]);
                close(true);
              }}
            >
              Any store
            </button>
            <button type="submit" className="button small-button">
              Done
            </button>
          </div>
        </Form>
      )}
    </Popover>
  );
}

// "Free from": the country's declared allergens. Only products with a
// confirmed label naming none of them qualify; the rest are counted as "not
// confirmed yet" rather than shown as safe.
export function FreeFromChecklist({
  country,
  options,
  filters,
}: {
  country: string;
  options: FilterOption[];
  filters: RankingFilters;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const chosen = new Set(filters.freeFrom);
  const names = options
    .filter((option) => chosen.has(option.key))
    .map((option) => option.label);
  const apply = (next: string[]) => {
    const value = { ...filters, freeFrom: [...new Set(next)].sort() };
    saveFilters(country, value);
    void navigate(filteredHref(location.pathname, location.search, value), {
      preventScrollReset: true,
    });
  };
  const params = new URLSearchParams(location.search);
  const summary = names.length
    ? summarizeNames(names.map((name) => `${name.toLowerCase()}-free`))
    : "Any";
  return (
    <Popover
      className={`va-store-menu${chosen.size ? " va-store-menu--active" : ""}`}
      summaryLabel={`Free from: ${names.length ? names.join(", ") : "any allergens"}`}
      panelLabel="Allergens to avoid"
      summary={
        <>
          <span className="va-store-menu__lead">Free from</span>
          <strong>{summary}</strong>
          <Icon name="chevronDown" size={14} strokeWidth={2.6} />
        </>
      }
    >
      {(close) => (
        <Form
          key={filters.freeFrom.join(",")}
          method="get"
          action={location.pathname}
          preventScrollReset
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            apply(data.getAll("freeFrom").map(String));
            close(true);
          }}
        >
          {params.get("view") && (
            <input type="hidden" name="view" value={params.get("view")!} />
          )}
          {filters.stores.length > 0 && (
            <input
              type="hidden"
              name="stores"
              value={filters.stores.join(",")}
            />
          )}
          <p className="va-menu-heading">Avoid products whose label lists</p>
          <ul className="va-check-list">
            {options.map((option) => (
              <li key={option.key}>
                <label>
                  <input
                    type="checkbox"
                    name="freeFrom"
                    value={option.key}
                    defaultChecked={chosen.has(option.key)}
                  />
                  <span className="va-check-list__name">{option.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <p className="va-menu-note">
            “May contain” counts too. Always check the package.
          </p>
          <div className="va-check-list__actions">
            <button
              type="button"
              className="text-button"
              onClick={() => {
                apply([]);
                close(true);
              }}
            >
              No allergen filter
            </button>
            <button type="submit" className="button small-button">
              Done
            </button>
          </div>
        </Form>
      )}
    </Popover>
  );
}

export function StoreLine({
  slugs,
  stores,
}: {
  slugs: string[];
  stores: StoreOption[];
}) {
  if (!slugs.length) return null;
  const names = slugs.map(
    (slug) => stores.find((store) => store.slug === slug)?.name ?? slug,
  );
  return (
    <span className="va-store-line">
      <Icon name="check" size={14} strokeWidth={2.8} />
      Commonly found at {names.join(", ")}
    </span>
  );
}

export function resultCount(shown: number, total: number, filtered: boolean) {
  return filtered
    ? `${formatCount(shown)} of ${plural(total, "ranked product")} match`
    : plural(total, "ranked product");
}
