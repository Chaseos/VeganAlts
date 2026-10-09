import type { ReactNode } from "react";
import { Link } from "react-router";
import { Icon } from "../icons/icon";
import { Wordmark } from "../icons/wordmark";
import { SearchForm } from "../catalog/search-form";
import { AccountMenu } from "./account-menu";
import { AppearanceMenu } from "./appearance-menu";
import { CountryMenu } from "./country-menu";
import { PhoneMenu } from "./phone-menu";
import { AisleBar } from "./aisle-bar";
import { homePath, searchPath, useSiteChrome } from "../../lib/site-chrome";

export interface PhoneBack {
  to: string;
  label: string;
  // Shown beside the back link, such as "Meat · Beef".
  context?: string;
}

export function SiteHeader({
  search = true,
  aisles = true,
  phoneBack,
  phoneTitle,
}: {
  // Home carries its own hero search.
  search?: boolean;
  aisles?: boolean;
  phoneBack?: PhoneBack;
  // Phone pages may place their H1 inside the kale band.
  phoneTitle?: ReactNode;
}) {
  const { country } = useSiteChrome();
  return (
    <header className="va-header va-kale">
      <div className="va-header__row">
        {phoneBack ? (
          <Link
            className="va-header__back"
            to={phoneBack.to}
            aria-label={`Back to ${phoneBack.label}`}
          >
            <Icon name="back" size={22} />
            <span aria-hidden="true">{phoneBack.label}</span>
          </Link>
        ) : null}
        <Link
          className={`va-header__brand${phoneBack ? " va-desktop-only" : ""}`}
          to={homePath(country.code)}
          aria-label="VeganAlts home"
        >
          <Wordmark size="header" />
        </Link>
        {phoneBack?.context && (
          <span className="va-header__context va-phone-only">
            {phoneBack.context}
          </span>
        )}
        {search && (
          <div className="va-header__search va-desktop-only">
            <SearchForm action={searchPath(country.code)} id="header-search" />
          </div>
        )}
        <div className="va-header__tools">
          <span className="va-desktop-only">
            <CountryMenu />
          </span>
          <span className="va-desktop-only">
            <AppearanceMenu />
          </span>
          <span className="va-desktop-only">
            <AccountMenu />
          </span>
          <Link
            className="va-icon-button va-phone-only"
            to={searchPath(country.code)}
            aria-label="Search"
          >
            <Icon name="search" size={22} />
          </Link>
          <PhoneMenu />
        </div>
      </div>
      {phoneTitle && <div className="va-header__phone-title">{phoneTitle}</div>}
      {aisles && <AisleBar />}
    </header>
  );
}
