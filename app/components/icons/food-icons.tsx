import { PathIcon } from "./icon";

// Aisle and food line icons. The taxonomy is managed data, so icons are looked
// up by slug; a new food falls back to its aisle's icon when one is passed,
// then to a plate.
const SHAPES = {
  meat: "M4 10.5C4 6.5 7.5 4 12 4s8 2.5 8 6.5zM3 14h18M4.5 17h15a2.5 2.5 0 0 1-2.5 3H7a2.5 2.5 0 0 1-2.5-3z",
  burger:
    "M4 11a8 6 0 0 1 16 0zM3 14h18M5 17h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z",
  chicken:
    "M14.5 3.5a5.5 5.5 0 0 1 2.4 10.5L11.5 19.5l-3-3 5.5-5.5a5.5 5.5 0 0 1 .5-7.5zM8.5 16.5l-3.5 3.5",
  nugget:
    "M7 6c3-2 8-1.5 10.5 1.5S20 15 17 18s-9 3-11.5 0S4 8 7 6zM9.5 11h.01M13 9h.01M14 14h.01",
  bacon: "M3 9c3-3 6 3 9 0s6-3 9 0M3 15c3-3 6 3 9 0s6-3 9 0M3 9v6M21 9v6",
  sausage:
    "M5 15c0-4 4-8 9-9 3-.5 5 1.5 4.5 4.5-1 5-5 9-9 9-3 .5-4.5-1.5-4.5-4.5zM7 16.5 4.5 19M17 7l2.5-2.5",
  seafood: "M3 12c3-4.5 9-6 14-2l4-3v10l-4-3c-5 4-11 2.5-14-2zM8 11.5h.01",
  milk: "M8 2.5h8V6l2.5 3.5V21h-13V9.5L8 6zM5.5 9.5h13M8 6h8M10 14h4",
  cheese:
    "M3 18v-6.5L17 5l4 6.5V18zM3 11.5h18M8 15h.01M13.5 14.5h.01M16.5 16h.01",
  butter: "M3 14.5 6.5 9H21l-3.5 5.5zM3 14.5V18h14.5v-3.5M17.5 18 21 12.5V9",
  yogurt: "M7 10a5 5 0 0 1 10 0zM7 10l5 11 5-11",
  egg: "M12 3c3.9 0 7 6.5 7 11a7 7 0 0 1-14 0c0-4.5 3.1-11 7-11z",
  bottle:
    "M12 2v3M10 5h4v2h-4zM8.5 7h7l1 3v10a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V10zM7.5 14h9",
  dip: "M3 12h18c0 4.5-4 8-9 8s-9-3.5-9-8zM13 12l2.5-8 5 4.5-2.5 3.5",
  chocolate: "M6 3h12v18H6zM6 9h12M6 15h12M12 3v18",
  cup: "M4 10h16l-2.5 8h-11zM4 10c3-3 13-3 16 0",
  candy: "M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M8 12 3 8v8zM16 12l5-4v8z",
  cake: "M4 20v-8h16v8zM2.5 20h19M4 15.5c2.7 1.3 5.3-1.3 8 0s5.3 1.3 8 0M12 12V8.5M12 5.5v.5",
  cookie:
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M9 9h.01M14 8h.01M15 13h.01M10 14.5h.01",
  bread: "M6 20h12v-8.5a3.5 3.5 0 1 0-1.5-6.5h-9A3.5 3.5 0 1 0 6 11.5z",
  swirl:
    "M10.5 12a1.5 1.5 0 0 1 3 0a3 3 0 0 1-6 0a4.5 4.5 0 0 1 9 0a6 6 0 0 1-12 0",
  pantry: "M8 3h8v3H8zM7 6h10l1 3v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V9zM6 12h12",
  plate:
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0",
} as const;

export type FoodShape = keyof typeof SHAPES;

export const FOOD_ICONS: Record<string, FoodShape> = {
  // Aisles
  beef: "meat",
  chicken: "chicken",
  pork: "bacon",
  "turkey-aisle": "chicken",
  "lamb-aisle": "meat",
  "fish-and-seafood": "seafood",
  "milk-aisle": "milk",
  "cream-aisle": "milk",
  "butter-aisle": "butter",
  "yogurt-aisle": "yogurt",
  "ice-cream-aisle": "yogurt",
  cheese: "cheese",
  "eggs-aisle": "egg",
  condiments: "bottle",
  "dips-and-spreads": "dip",
  chocolate: "chocolate",
  candy: "candy",
  "bakery-and-desserts": "cake",
  // Foods
  "ground-beef": "meat",
  "beef-burgers": "burger",
  meatballs: "meat",
  "hot-dogs": "sausage",
  "chicken-nuggets": "nugget",
  "grilled-chicken-strips": "chicken",
  "chicken-patties": "burger",
  "chicken-tenders": "nugget",
  "boneless-wings": "chicken",
  bacon: "bacon",
  "breakfast-sausage": "sausage",
  chorizo: "sausage",
  "italian-sausage": "sausage",
  "turkey-roast": "chicken",
  "turkey-deli-slices": "chicken",
  "fish-fillets": "seafood",
  milk: "milk",
  "chocolate-milk": "milk",
  eggnog: "milk",
  "coffee-creamer": "milk",
  "half-and-half": "milk",
  "sour-cream": "yogurt",
  "whipped-cream": "milk",
  butter: "butter",
  yogurt: "yogurt",
  "greek-yogurt": "yogurt",
  "ice-cream": "yogurt",
  cheddar: "cheese",
  mozzarella: "cheese",
  "smoked-gouda": "cheese",
  "pepper-jack": "cheese",
  "american-cheese": "cheese",
  "mexican-blend": "cheese",
  parmesan: "cheese",
  "cream-cheese": "cheese",
  queso: "dip",
  "spinach-artichoke-dip": "dip",
  "french-onion-dip": "dip",
  tzatziki: "dip",
  "milk-chocolate": "chocolate",
  "peanut-butter-cups": "cup",
  "candy-bars": "chocolate",
  "white-chocolate": "chocolate",
  "gummy-candy": "candy",
  marshmallows: "candy",
  "chocolate-hazelnut-spread": "pantry",
  "pudding-cups": "yogurt",
  "chocolate-chips": "chocolate",
  "candy-coated-chocolates": "candy",
  caramels: "candy",
  cookies: "cookie",
  cake: "cake",
  brownies: "chocolate",
  muffins: "cup",
  "cinnamon-rolls": "swirl",
  "pies-and-cheesecake": "cheese",
  "baking-mixes": "pantry",
  "brioche-and-rolls": "bread",
  eggs: "egg",
  "eggs-for-baking": "egg",
  mayonnaise: "bottle",
  "ranch-dressing": "bottle",
  "caesar-dressing": "bottle",
  "worcestershire-sauce": "bottle",
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
  // The food's aisle slug, when known.
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
