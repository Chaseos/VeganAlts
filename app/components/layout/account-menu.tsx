import { Link, useLocation } from "react-router";
import { Icon } from "../icons/icon";
import { Popover } from "../ui/popover";
import { useOptionalPersonalState } from "../personal-state";
import { useHydrated } from "../../lib/use-hydrated";
import { useCountryCode } from "../../lib/site-chrome";
import { t } from "../../i18n";

// Add a product starts in the country being browsed.
export const accountLinks = (country: string) => [
  { to: "/my-ratings", label: t("menu.myRatings") },
  { to: "/saved", label: t("menu.saved") },
  { to: "/my-contributions", label: t("menu.myContributions") },
  { to: `/add-product?country=${country}`, label: t("menu.addProduct") },
  { to: "/account", label: t("menu.accountSettings") },
];

export const operatorLinks = () => [
  { to: "/admin/moderation", label: t("menu.moderation") },
  { to: "/admin/taxonomy", label: t("menu.taxonomy") },
  { to: "/admin/analytics", label: t("menu.analytics") },
];

export function useSignInHref() {
  const location = useLocation();
  const hydrated = useHydrated();
  // Cached HTML cannot know the visitor's fragment or discarded query params.
  // Keep the first client render identical, then attach the full return URL.
  return hydrated
    ? `/sign-in?returnTo=${encodeURIComponent(`${location.pathname}${location.search}${location.hash}`)}`
    : "/sign-in";
}

export function AccountMenu() {
  const user = useOptionalPersonalState()?.user;
  const country = useCountryCode();
  const location = useLocation();
  const signIn = useSignInHref();
  if (!user)
    return location.pathname === "/sign-in" ? (
      <span className="va-header-link" aria-current="page">
        {t("menu.signIn")}
      </span>
    ) : (
      <Link className="va-header-link" to={signIn}>
        {t("menu.signIn")}
      </Link>
    );
  return (
    <Popover
      align="end"
      tone="kale"
      className="va-account-menu"
      summaryLabel={t("menu.accountLabel", {
        name: user.displayName || user.handle,
      })}
      panelLabel={t("menu.account")}
      summary={
        <>
          <Icon name="user" size={18} />
          <span className="va-header-link__text">{t("menu.account")}</span>
          <Icon name="chevronDown" size={12} strokeWidth={3} />
        </>
      }
    >
      {() => (
        <nav aria-label={t("menu.account")}>
          <p className="va-menu-heading">
            {t("menu.signedInAs", { handle: user.handle })}
          </p>
          <ul className="va-menu-list">
            {accountLinks(country).map((link) => (
              <li key={link.to}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
          {user.administrator && (
            <>
              <p className="va-menu-heading">{t("menu.operators")}</p>
              <ul className="va-menu-list">
                {operatorLinks().map((link) => (
                  <li key={link.to}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </nav>
      )}
    </Popover>
  );
}
