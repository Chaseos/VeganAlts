import { useRef } from "react";
import { Link } from "react-router";
import { Icon } from "../icons/icon";
import { FoodIcon } from "../icons/food-icons";
import { AppearanceControl } from "./appearance-menu";
import { accountLinks, OPERATOR_LINKS, useSignInHref } from "./account-menu";
import { CountryList } from "./country-menu";
import { useOptionalPersonalState } from "../personal-state";
import { foodPath, useSiteChrome } from "../../lib/site-chrome";
import { useHydrated } from "../../lib/use-hydrated";
import { ABOUT_LINKS } from "./site-footer";

export const PHONE_MENU_ID = "site-menu";

export function openPhoneMenu() {
  const dialog = document.getElementById(PHONE_MENU_ID);
  if (dialog instanceof HTMLDialogElement && !dialog.open) dialog.showModal();
}

// The phone site menu: aisles, country, appearance and account. A modal
// <dialog> gives focus containment and Escape. Before hydration the menu
// control jumps to the footer, which lists the same destinations.
export function PhoneMenu() {
  const hydrated = useHydrated();
  const dialog = useRef<HTMLDialogElement>(null);
  const { country, countries, aisles } = useSiteChrome();
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
            {aisles.length > 0 && (
              <section aria-labelledby="sheet-aisles">
                <h2 id="sheet-aisles" className="va-menu-heading">
                  Aisles
                </h2>
                <ul className="va-sheet__list">
                  {aisles.map((aisle) => (
                    <li key={aisle.slug}>
                      <Link
                        to={foodPath(country.code, aisle.slug)}
                        onClick={close}
                      >
                        <FoodIcon
                          slug={aisle.slug}
                          size={20}
                          className="va-good-icon"
                        />
                        <span>{aisle.name}</span>
                        <Icon name="chevronRight" size={14} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
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
            <section aria-label="Appearance">
              <AppearanceControl name="appearance-phone" />
            </section>
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
