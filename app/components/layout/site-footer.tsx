import { Link } from "react-router";
import { Wordmark } from "../icons/wordmark";
import {
  foodPath,
  homePath,
  searchPath,
  useSiteChrome,
} from "../../lib/site-chrome";
import { POPULAR_AISLE_COUNT } from "../../lib/aisles";
import { t } from "../../i18n";

export const aboutLinks = () => [
  { to: "/about/rankings", label: t("footer.rankings") },
  { to: "/about/vegan-status", label: t("footer.veganStatus") },
  { to: "/about/moderation", label: t("footer.moderation") },
  { to: "/about/terms", label: t("footer.guidelines") },
  { to: "/about/privacy", label: t("footer.privacy") },
  { to: "/about/contact", label: t("footer.contact") },
];

// The full footer also serves as the no-JavaScript site menu on phones (the
// header's Menu link points here), so it lists aisles, countries and account.
export function SiteFooter({
  variant = "full",
}: {
  variant?: "full" | "compact";
}) {
  const { country, countries, aisles } = useSiteChrome();
  return (
    <footer
      id="site-footer"
      className={`va-footer va-kale va-footer--${variant}`}
    >
      <div className="va-footer__inner">
        <div className="va-footer__brand">
          <Link to={homePath(country.code)} aria-label={t("chrome.home")}>
            <Wordmark size="footer" />
          </Link>
          <p>{t("footer.tagline", { country: country.name })}</p>
        </div>
        <nav className="va-footer__columns" aria-label={t("footer.label")}>
          {variant === "full" && aisles.length > 0 && (
            <div className="va-footer__group">
              <h2 className="va-footer__heading">{t("footer.popular")}</h2>
              <ul>
                {aisles.slice(0, POPULAR_AISLE_COUNT).map((aisle) => (
                  <li key={aisle.slug}>
                    <Link to={foodPath(country.code, aisle.slug)}>
                      {aisle.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link to={searchPath(country.code)}>
                    {t("nav.browseAll")}
                  </Link>
                </li>
              </ul>
            </div>
          )}
          {variant === "full" && countries.length > 1 && (
            <div className="va-footer__group">
              <h2 className="va-footer__heading">{t("country.countries")}</h2>
              <ul>
                {countries.map((item) => (
                  <li key={item.code}>
                    <Link
                      to={homePath(item.code)}
                      aria-current={
                        item.code === country.code ? "true" : undefined
                      }
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="va-footer__group">
            <h2 className="va-footer__heading">{t("footer.contribute")}</h2>
            <ul>
              <li>
                <Link to={`/add-product?country=${country.code}`}>
                  {t("menu.addProduct")}
                </Link>
              </li>
              <li>
                <Link to={`/propose-category?country=${country.code}`}>
                  {t("nav.suggestFood")}
                </Link>
              </li>
              <li>
                <Link to="/my-ratings">{t("menu.myRatings")}</Link>
              </li>
              <li>
                <Link to="/saved">{t("menu.saved")}</Link>
              </li>
              <li>
                <Link to="/account">{t("menu.account")}</Link>
              </li>
            </ul>
          </div>
          <div className="va-footer__group">
            <h2 className="va-footer__heading">{t("footer.about")}</h2>
            <ul>
              {aboutLinks().map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </footer>
  );
}
