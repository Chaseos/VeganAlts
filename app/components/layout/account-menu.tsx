import { Link, useLocation } from "react-router";
import { Icon } from "../icons/icon";
import { Popover } from "../ui/popover";
import { useOptionalPersonalState } from "../personal-state";
import { useHydrated } from "../../lib/use-hydrated";

export const ACCOUNT_LINKS = [
  { to: "/my-ratings", label: "My ratings" },
  { to: "/my-contributions", label: "My contributions" },
  { to: "/add-product", label: "Add a product" },
  { to: "/account", label: "Account settings" },
];

export const OPERATOR_LINKS = [
  { to: "/admin/moderation", label: "Moderation inbox" },
  { to: "/admin/taxonomy", label: "Taxonomy" },
  { to: "/admin/media", label: "Media" },
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
  const location = useLocation();
  const signIn = useSignInHref();
  if (!user)
    return location.pathname === "/sign-in" ? (
      <span className="va-header-link" aria-current="page">
        Sign in
      </span>
    ) : (
      <Link className="va-header-link" to={signIn}>
        Sign in
      </Link>
    );
  return (
    <Popover
      align="end"
      tone="kale"
      className="va-account-menu"
      summaryLabel={`Account: ${user.displayName || user.handle}`}
      panelLabel="Account"
      summary={
        <>
          <Icon name="user" size={18} />
          <span className="va-header-link__text">Account</span>
          <Icon name="chevronDown" size={12} strokeWidth={3} />
        </>
      }
    >
      {() => (
        <nav aria-label="Account">
          <p className="va-menu-heading">Signed in as {user.handle}</p>
          <ul className="va-menu-list">
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.to}>
                <Link to={link.to}>{link.label}</Link>
              </li>
            ))}
          </ul>
          {user.administrator && (
            <>
              <p className="va-menu-heading">Operators</p>
              <ul className="va-menu-list">
                {OPERATOR_LINKS.map((link) => (
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
