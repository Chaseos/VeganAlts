import { Link, useLocation } from "react-router";
import { FoodIcon } from "../icons/food-icons";
import { useSiteChrome } from "../../lib/site-chrome";
import { useHydrated } from "../../lib/use-hydrated";
import {
  currentNavigationGroup,
  groupCategories,
  navigationGroupPath,
} from "../../lib/navigation-groups";

// Phone shortcuts open group sections in the server-rendered directory.
export function AisleBar() {
  const { country, aisles } = useSiteChrome();
  const location = useLocation();
  const hydrated = useHydrated();
  const groups = groupCategories(aisles);
  // URL fragments are absent from the shared server document.
  const current = currentNavigationGroup(groups, {
    ...location,
    hash: hydrated ? location.hash : "",
  });
  if (!groups.length) return null;
  return (
    <nav className="va-aisle-bar" aria-label="Categories">
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            <Link
              to={navigationGroupPath(country.code, group.id)}
              discover="none"
              aria-current={current === group.id ? "true" : undefined}
            >
              <FoodIcon
                slug={group.iconSlug}
                size={20}
                className="va-tag-icon"
              />
              <span>{group.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
