import { useRef } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "../icons/icon";
import { FoodIcon } from "../icons/food-icons";
import { AppearanceControl } from "./appearance-menu";
import { accountLinks, OPERATOR_LINKS, useSignInHref } from "./account-menu";
import { CountryList } from "./country-menu";
import { useOptionalPersonalState } from "../personal-state";
import { searchPath, useSiteChrome } from "../../lib/site-chrome";
import {
  currentNavigationGroup,
  groupCategories,
  navigationGroupPath,
} from "../../lib/navigation-groups";
import { FoodGroupSections } from "./food-navigation";
import { useHydrated } from "../../lib/use-hydrated";
import { ABOUT_LINKS } from "./site-footer";

export const PHONE_MENU_ID = "site-menu";

export function openPhoneMenu() {
  const dialog = document.getElementById(PHONE_MENU_ID);
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

// The phone site menu: country and account before aisles and appearance. A modal
// <dialog> gives focus containment and Escape. Before hydration the menu
// control jumps to the footer, which lists the same destinations.
export function PhoneMenu() {
  const hydrated = useHydrated();
  const dialog = useRef<HTMLDialogElement>(null);
  const { country, countries, aisles } = useSiteChrome();
  const location = useLocation();
  const groups = groupCategories(aisles);
  const current = currentNavigationGroup(groups, location);
  const user = useOptionalPersonalState()?.user;
  const signIn = useSignInHref();
  const close = () => dialog.current?.close();
  return (
    <>
      {hydrated ? (
        <button
          type="button"
          className="va-icon-button va-phone-only"
          aria-label="Menu"
          aria-haspopup="dialog"
          onClick={openPhoneMenu}
        >
          <Icon name="menu" size={22} />
        </button>
      ) : (
        <a
          className="va-icon-button va-phone-only"
          href="#site-footer"
          aria-label="Menu"
        >
          <Icon name="menu" size={22} />
        </a>
      )}
      {hydrated && (
        <dialog
          ref={dialog}
          id={PHONE_MENU_ID}
          className="va-sheet"
          aria-label="Site menu"
          onClick={(event) => {
            if (event.target === dialog.current) close();
          }}
        >
          <div className="va-sheet__body">
            <div className="va-sheet__top">
              <span className="va-heading-s">Menu</span>
              <button
                type="button"
                className="va-icon-button"
                aria-label="Close menu"
                onClick={close}
              >
                <Icon name="close" size={22} />
              </button>
            </div>
            {countries.length > 1 && (
              <section aria-labelledby="sheet-country">
                <h2 id="sheet-country" className="va-menu-heading">
                  Country
                </h2>
                <CountryList
                  current={country.code}
                  countries={countries}
                  onSelect={close}
                />
              </section>
            )}
            <section aria-labelledby="sheet-account">
              <h2 id="sheet-account" className="va-menu-heading">
                Account
              </h2>
              <ul className="va-sheet__list">
                {user ? (
                  [
                    ...accountLinks(country.code),
                    ...(user.administrator ? OPERATOR_LINKS : []),
                  ].map((link) => (
                    <li key={link.to}>
                      <Link to={link.to} onClick={close}>
                        <span>{link.label}</span>
                        <Icon name="chevronRight" size={14} />
                      </Link>
                    </li>
                  ))
                ) : (
                  <li>
                    <Link to={signIn} onClick={close}>
                      <span>Sign in</span>
                      <Icon name="chevronRight" size={14} />
                    </Link>
                  </li>
                )}
              </ul>
            </section>
            {groups.length > 0 && (
              <section aria-labelledby="sheet-aisles">
                <h2 id="sheet-aisles" className="va-menu-heading">
                  Categories
                </h2>
                {groups.map((group) => (
                  <details
                    key={`${location.key}:${group.id}`}
                    className="va-sheet__group"
                    open={group.id === current}
                  >
                    <summary>
                      <FoodIcon
                        slug={group.iconSlug}
                        size={20}
                        className="va-good-icon"
                      />
                      <span>{group.name}</span>
                      <Icon name="chevronDown" size={16} />
                    </summary>
                    <FoodGroupSections
                      country={country.code}
                      group={group}
                      onNavigate={close}
                    />
                    <Link
                      className="va-link va-sheet__group-all"
                      to={navigationGroupPath(country.code, group.id)}
                      discover="none"
                      onClick={close}
                    >
                      Browse all {group.name.toLowerCase()}
                    </Link>
                  </details>
                ))}
                <Link
                  className="va-link va-sheet__group-all"
                  to={searchPath(country.code)}
                  discover="none"
                  onClick={close}
                >
                  Browse all categories
                </Link>
              </section>
            )}
            <section aria-label="Appearance">
              <AppearanceControl name="appearance-phone" />
            </section>
            <nav aria-label="About VeganAlts" className="va-sheet__about">
              {ABOUT_LINKS.map((link) => (
                <Link key={link.to} to={link.to} onClick={close}>
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </dialog>
      )}
    </>
  );
}
