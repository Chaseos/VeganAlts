import { useRef } from "react";
import { Link, useLocation } from "react-router";
import { Icon } from "../icons/icon";
import { FoodIcon } from "../icons/food-icons";
import { AppearanceControl } from "./appearance-menu";
import { accountLinks, operatorLinks, useSignInHref } from "./account-menu";
import { CountryList } from "./country-menu";
import { PhoneLanguages } from "./language-menu";
import { useOptionalPersonalState } from "../personal-state";
import { searchPath, useSiteChrome } from "../../lib/site-chrome";
import {
  currentNavigationGroup,
  groupCategories,
  navigationGroupPath,
} from "../../lib/navigation-groups";
import { FoodGroupSections } from "./food-navigation";
import { useHydrated } from "../../lib/use-hydrated";
import { aboutLinks } from "./site-footer";
import { t } from "../../i18n";

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
          aria-label={t("phone.menu")}
          aria-haspopup="dialog"
          onClick={openPhoneMenu}
        >
          <Icon name="menu" size={22} />
        </button>
      ) : (
        <a
          className="va-icon-button va-phone-only"
          href="#site-footer"
          aria-label={t("phone.menu")}
        >
          <Icon name="menu" size={22} />
        </a>
      )}
      {hydrated && (
        <dialog
          ref={dialog}
          id={PHONE_MENU_ID}
          className="va-sheet"
          aria-label={t("phone.siteMenu")}
          onClick={(event) => {
            if (event.target === dialog.current) close();
          }}
        >
          <div className="va-sheet__body">
            <div className="va-sheet__top">
              <span className="va-heading-s">{t("phone.menu")}</span>
              <button
                type="button"
                className="va-icon-button"
                aria-label={t("phone.close")}
                onClick={close}
              >
                <Icon name="close" size={22} />
              </button>
            </div>
            {countries.length > 1 && (
              <section aria-labelledby="sheet-country">
                <h2 id="sheet-country" className="va-menu-heading">
                  {t("phone.country")}
                </h2>
                <CountryList
                  current={country.code}
                  countries={countries}
                  onSelect={close}
                />
              </section>
            )}
            <PhoneLanguages />
            <section aria-labelledby="sheet-account">
              <h2 id="sheet-account" className="va-menu-heading">
                {t("menu.account")}
              </h2>
              <ul className="va-sheet__list">
                {user ? (
                  [
                    ...accountLinks(country.code),
                    ...(user.administrator ? operatorLinks() : []),
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
                      <span>{t("menu.signIn")}</span>
                      <Icon name="chevronRight" size={14} />
                    </Link>
                  </li>
                )}
              </ul>
            </section>
            {groups.length > 0 && (
              <section aria-labelledby="sheet-aisles">
                <h2 id="sheet-aisles" className="va-menu-heading">
                  {t("aisles.categories")}
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
                      {t("foodNav.browseGroup", {
                        group: group.name.toLowerCase(),
                      })}
                    </Link>
                  </details>
                ))}
                <Link
                  className="va-link va-sheet__group-all"
                  to={searchPath(country.code)}
                  discover="none"
                  onClick={close}
                >
                  {t("nav.browseAll")}
                </Link>
              </section>
            )}
            <section aria-label={t("appearance.label")}>
              <AppearanceControl name="appearance-phone" />
            </section>
            <nav aria-label={t("phone.about")} className="va-sheet__about">
              {aboutLinks().map((link) => (
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
