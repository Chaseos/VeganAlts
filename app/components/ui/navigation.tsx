import { Fragment, type ReactNode } from "react";
import { Link, useLocation } from "react-router";

export function Breadcrumb({
  items,
}: {
  items: { label: string; to?: string }[];
}) {
  return (
    <nav className="va-breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            {index > 0 && (
              <li aria-hidden="true" className="va-breadcrumb__sep">
                /
              </li>
            )}
            <li>
              {item.to && index < items.length - 1 ? (
                <Link to={item.to}>{item.label}</Link>
              ) : (
                <span
                  aria-current={index === items.length - 1 ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({
  page,
  hasNext,
  parameter = "page",
  label = "Rankings",
}: {
  page: number;
  hasNext: boolean;
  parameter?: string;
  label?: string;
}) {
  const location = useLocation();
  const destination = (number: number) => {
    const params = new URLSearchParams(location.search);
    if (number === 1) params.delete(parameter);
    else params.set(parameter, String(number));
    return `${location.pathname}${params.size ? `?${params}` : ""}`;
  };
  if (page === 1 && !hasNext) return null;
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      {page > 1 ? (
        <Link
          className="button secondary"
          to={destination(page - 1)}
          rel="prev"
        >
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="va-small va-muted">Page {page}</span>
      {hasNext && page < 100 ? (
        <Link
          className="button secondary"
          to={destination(page + 1)}
          rel="next"
        >
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

// Link tabs share the segmented look; the current one carries aria-current.
export function TabLinks({
  label,
  tabs,
}: {
  label: string;
  tabs: { to: string; label: ReactNode; current: boolean }[];
}) {
  return (
    <nav className="va-tabs" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          aria-current={tab.current ? "page" : undefined}
          preventScrollReset
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

// Native radios inside a fieldset: arrow keys move the choice for free.
export function SegmentedControl<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  hideLegend = false,
}: {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  hideLegend?: boolean;
}) {
  return (
    <fieldset className="va-segmented">
      <legend className={hideLegend ? "sr-only" : "va-segmented__legend"}>
        {legend}
      </legend>
      <div className="va-segmented__track">
        {options.map((option) => (
          <label key={option.value} className="va-segmented__option">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
