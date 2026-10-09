import { PathIcon } from "./icon";

// Aisle and food line icons. The taxonomy is managed data, so icons are looked
// up by slug; a new food falls back to its shelf's or aisle's icon, then to a
// plate.
const SHAPES = {
  meat: "M4 10.5C4 6.5 7.5 4 12 4s8 2.5 8 6.5zM3 14h18M4.5 17h15a2.5 2.5 0 0 1-2.5 3H7a2.5 2.5 0 0 1-2.5-3z",
  burger:
    "M4 11a8 6 0 0 1 16 0zM3 14h18M5 17h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z",
  chicken:
    "M14.5 3.5a5.5 5.5 0 0 1 2.4 10.5L11.5 19.5l-3-3 5.5-5.5a5.5 5.5 0 0 1 .5-7.5zM8.5 16.5l-3.5 3.5",
  nugget:
    "M7 6c3-2 8-1.5 10.5 1.5S20 15 17 18s-9 3-11.5 0S4 8 7 6zM9.5 11h.01M13 9h.01M14 14h.01",
  bacon: "M3 9c3-3 6 3 9 0s6-3 9 0M3 15c3-3 6 3 9 0s6-3 9 0M3 9v6M21 9v6",
  seafood: "M3 12c3-4.5 9-6 14-2l4-3v10l-4-3c-5 4-11 2.5-14-2zM8 11.5h.01",
  milk: "M8 2.5h8V6l2.5 3.5V21h-13V9.5L8 6zM5.5 9.5h13M8 6h8M10 14h4",
  cheese:
    "M3 18v-6.5L17 5l4 6.5V18zM3 11.5h18M8 15h.01M13.5 14.5h.01M16.5 16h.01",
  butter: "M3 14.5 6.5 9H21l-3.5 5.5zM3 14.5V18h14.5v-3.5M17.5 18 21 12.5V9",
  yogurt: "M7 10a5 5 0 0 1 10 0zM7 10l5 11 5-11",
  egg: "M12 3c3.9 0 7 6.5 7 11a7 7 0 0 1-14 0c0-4.5 3.1-11 7-11z",
  pantry: "M8 3h8v3H8zM7 6h10l1 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9zM6 12h12",
  plate:
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0",
} as const;

export type FoodShape = keyof typeof SHAPES;

export const FOOD_ICONS: Record<string, FoodShape> = {
  meat: "meat",
  beef: "meat",
  "ground-beef": "meat",
  "beef-burgers": "burger",
  chicken: "chicken",
  "chicken-nuggets": "nugget",
  pork: "bacon",
  bacon: "bacon",
  seafood: "seafood",
  dairy: "milk",
  "milk-shelf": "milk",
  milk: "milk",
  "butter-shelf": "butter",
  butter: "butter",
  cheese: "cheese",
  "block-and-shredded": "cheese",
  "soft-and-spreadable": "cheese",
  cheddar: "cheese",
  mozzarella: "cheese",
  "cream-cheese": "cheese",
  "eggs-aisle": "egg",
  "eggs-shelf": "egg",
  eggs: "egg",
  yogurt: "yogurt",
  pantry: "pantry",
};

export function foodShape(slugs: (string | null | undefined)[]): FoodShape {
  for (const slug of slugs)
    if (slug && FOOD_ICONS[slug]) return FOOD_ICONS[slug];
  return "plate";
}

export function FoodIcon({
  slug,
  fallback = [],
  size = 20,
  className,
}: {
  slug: string;
  // The food's shelf and aisle slugs, nearest first.
  fallback?: (string | null | undefined)[];
  size?: number;
  className?: string;
}) {
  return (
    <PathIcon
      path={SHAPES[foodShape([slug, ...fallback])]}
      size={size}
      strokeWidth={1.8}
      className={className}
    />
  );
}
