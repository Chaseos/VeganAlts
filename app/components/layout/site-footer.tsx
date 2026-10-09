import { Link } from "react-router";
import { Wordmark } from "../icons/wordmark";
import { foodPath, homePath, useSiteChrome } from "../../lib/site-chrome";

export const ABOUT_LINKS = [
  { to: "/about/rankings", label: "How rankings work" },
  { to: "/about/vegan-status", label: "Vegan status" },
  { to: "/about/moderation", label: "Moderation" },
  { to: "/about/terms", label: "Guidelines" },
  { to: "/about/privacy", label: "Privacy" },
  { to: "/about/contact", label: "Contact" },
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
          <Link to={homePath(country.code)} aria-label="VeganAlts home">
            <Wordmark size="footer" />
          </Link>
          <p>
            Community-ranked vegan alternatives · {country.name} · Never
            sponsored
          </p>
        </div>
        <div className="va-footer__columns">
          {variant === "full" && aisles.length > 0 && (
            <nav aria-label="Aisles">
              <h2 className="va-footer__heading">Aisles</h2>
              <ul>
                {aisles.map((aisle) => (
                  <li key={aisle.slug}>
                    <Link to={foodPath(country.code, aisle.slug)}>
                      {aisle.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          {variant === "full" && countries.length > 1 && (
            <nav aria-label="Countries">
              <h2 className="va-footer__heading">Countries</h2>
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
            </nav>
          )}
          <nav aria-label="Contribute">
            <h2 className="va-footer__heading">Contribute</h2>
            <ul>
              <li>
                <Link to={`/add-product?country=${country.code}`}>
                  Add a product
                </Link>
              </li>
              <li>
                <Link to={`/propose-category?country=${country.code}`}>
                  Suggest a food
                </Link>
              </li>
              <li>
                <Link to="/my-ratings">My ratings</Link>
              </li>
              <li>
                <Link to="/account">Account</Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="About VeganAlts">
            <h2 className="va-footer__heading">About</h2>
            <ul>
              {ABOUT_LINKS.map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}
