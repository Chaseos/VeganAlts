import { NavLink } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { foodPath, useSiteChrome } from "../../lib/site-chrome";

// The header's second row: one link per aisle. It scrolls sideways on narrow
// screens. (The desktop aisle menu enhances these links; see aisle-menu.tsx.)
export function AisleBar() {
  const { country, aisles } = useSiteChrome();
  if (!aisles.length) return null;
  return (
    <nav className="va-aisle-bar" aria-label="Aisles">
      <ul>
        {aisles.map((aisle) => (
          <li key={aisle.slug}>
            <NavLink to={foodPath(country.code, aisle.slug)} prefetch="intent">
              <FoodIcon slug={aisle.slug} size={20} className="va-tag-icon" />
              <span>{aisle.name}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
