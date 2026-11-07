import { Link, useMatches } from "react-router";
import { Icon } from "../icons/icon";
import { Popover } from "../ui/popover";
import {
  homePath,
  useSiteChrome,
  type ChromeCountry,
} from "../../lib/site-chrome";
import { changesLanguage } from "@server/catalog/domain/markets";
import { PREFERENCE_KEYS, writePreference } from "../../lib/device-preferences";
import { t } from "../../i18n";

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
              reloadDocument={changesLanguage(hrefFor(country.code))}
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
                {country.hasRankings
                  ? t("country.rankings")
                  : t("country.noRankings")}
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
      <Icon
        name="globe"
        size={18}
        strokeWidth={1.8}
        className="va-tag-icon va-desktop-only"
      />
      <span className="va-desktop-only">{country.name}</span>
      <span className="va-phone-only" aria-hidden="true">
        {country.code.toUpperCase()}
      </span>
      {countries.length > 1 && (
        <Icon
          name="chevronDown"
          size={12}
          strokeWidth={3}
          className="va-desktop-only"
        />
      )}
    </>
  );
  if (countries.length <= 1)
    return (
      <span className="va-country-button">
        {summary}
        <span className="sr-only va-phone-only">
          {t("country.current", {
            name: country.name,
            code: country.code.toUpperCase(),
          })}
        </span>
      </span>
    );
  return (
    <Popover
      align="end"
      tone="kale"
      className="va-country-menu"
      summaryLabel={t("country.change", {
        name: country.name,
        code: country.code.toUpperCase(),
      })}
      panelLabel={t("country.choose")}
      summary={summary}
    >
      {() => (
        <nav aria-label={t("country.countries")}>
          <p className="va-menu-heading">{t("country.rankingsFor")}</p>
          <CountryList current={country.code} countries={countries} />
          <p className="va-menu-note">{t("country.note")}</p>
        </nav>
      )}
    </Popover>
  );
}
