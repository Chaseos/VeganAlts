import { Link, useMatches } from "react-router";
import { Icon } from "../icons/icon";
import { Popover } from "../ui/popover";
import {
  homePath,
  useSiteChrome,
  type ChromeCountry,
} from "../../lib/site-chrome";
import { PREFERENCE_KEYS, writePreference } from "../../lib/device-preferences";

// Where switching country should land: the same food or aisle when the page
// names one (routes expose `countrySwitch` in their handle data), otherwise
// that country's home. A product page moves to its food.
export function useCountryHref() {
  const matches = useMatches();
  let pathFor = (code: string) => homePath(code);
  for (const match of matches) {
    const handle = match.handle as
      | { countrySwitch?: (data: unknown, code: string) => string | null }
      | undefined;
    const target = handle?.countrySwitch;
    if (target) {
      const previous = pathFor;
      pathFor = (code) => target(match.loaderData, code) ?? previous(code);
    }
  }
  return pathFor;
}

export function rememberCountry(code: string) {
  writePreference(PREFERENCE_KEYS.country, code);
}

export function CountryList({
  current,
  countries,
  onSelect,
}: {
  current: string;
  countries: ChromeCountry[];
  onSelect?: () => void;
}) {
  const hrefFor = useCountryHref();
  return (
    <ul className="va-menu-list va-country-list">
      {countries.map((country) => {
        const selected = country.code === current;
        return (
          <li key={country.code}>
            <Link
              to={hrefFor(country.code)}
              aria-current={selected ? "true" : undefined}
              onClick={() => {
                rememberCountry(country.code);
                onSelect?.();
              }}
            >
              <span className="va-menu-check" aria-hidden="true">
                {selected && <Icon name="check" size={16} strokeWidth={3} />}
              </span>
              <span className="va-country-list__name">{country.name}</span>
              <span className="va-country-list__note">
                {country.hasRankings ? "Rankings" : "No rankings yet"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CountryMenu() {
  const { country, countries } = useSiteChrome();
  const summary = (
    <>
      <Icon name="globe" size={18} strokeWidth={1.8} className="va-tag-icon" />
      <span>{country.name}</span>
      {countries.length > 1 && (
        <Icon name="chevronDown" size={12} strokeWidth={3} />
      )}
    </>
  );
  if (countries.length <= 1)
    return <span className="va-country-button">{summary}</span>;
  return (
    <Popover
      align="end"
      tone="kale"
      className="va-country-menu"
      summaryLabel={`Country: ${country.name}. Change country`}
      panelLabel="Choose a country"
      summary={summary}
    >
      {() => (
        <nav aria-label="Countries">
          <p className="va-menu-heading">Rankings for</p>
          <CountryList current={country.code} countries={countries} />
          <p className="va-menu-note">
            Each country’s rankings come from people who live there. Empty
            countries invite the first products.
          </p>
        </nav>
      )}
    </Popover>
  );
}
