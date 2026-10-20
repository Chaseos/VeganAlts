import { NavLink } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { foodPath, useSiteChrome } from "../../lib/site-chrome";

// The phone header's second row: each aisle is a chip linking to its aisle
// page, and the row scrolls sideways. Desktop opens aisles from the Foods
// menu in the header row instead (FoodsMenu).
export function AisleBar() {
  const { country, aisles } = useSiteChrome();
  if (!aisles.length) return null;
  return (
    <nav className="va-aisle-bar" aria-label="Categories">
      <ul>
        {aisles.map((aisle) => (
          <li key={aisle.slug}>
            <NavLink to={foodPath(country.code, aisle.slug)} discover="none">
              <FoodIcon slug={aisle.slug} size={20} className="va-tag-icon" />
              <span>{aisle.name}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
