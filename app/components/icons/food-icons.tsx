import { PathIcon } from "./icon";

// Aisle and food line icons. The taxonomy is managed data, so icons are looked
// up by slug; a new food falls back to its aisle's icon when one is passed,
// then to a plate.
// Poultry, yogurt and ice cream use library artwork; see THIRD_PARTY.md.
const SHAPES = {
  iceCream: [
    "m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11",
    "M17 7A5 5 0 0 0 7 7",
    "M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4",
  ],
  turkey: [
    "M13.62 8.382l1.966 -1.967a2 2 0 1 1 3.414 -1.415a2 2 0 1 1 -1.413 3.414l-1.82 1.821",
    "M5.904 18.596c2.733 2.734 5.9 4 7.07 2.829c1.172 -1.172 -.094 -4.338 -2.828 -7.071c-2.733 -2.734 -5.9 -4 -7.07 -2.829c-1.172 1.172 .094 4.338 2.828 7.071",
    "M7.5 16l1 1",
    "M12.975 21.425c3.905 -3.906 4.855 -9.288 2.121 -12.021c-2.733 -2.734 -8.115 -1.784 -12.02 2.121",
  ],
  meat: "M4 10.5C4 6.5 7.5 4 12 4s8 2.5 8 6.5zM3 14h18M4.5 17h15a2.5 2.5 0 0 1-2.5 3H7a2.5 2.5 0 0 1-2.5-3z",
  burger:
    "M4 11a8 6 0 0 1 16 0zM3 14h18M5 17h14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z",
  chicken: [
    "M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23",
    "m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59",
  ],
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
  yogurt: [
    "M4 11h16a1 1 0 0 1 1 1v.5c0 1.5 -2.517 5.573 -4 6.5v1a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-1c-1.687 -1.054 -4 -5 -4 -6.5v-.5a1 1 0 0 1 1 -1",
    "M8 7c1.657 0 3 -.895 3 -2s-1.343 -2 -3 -2s-3 .895 -3 2s1.343 2 3 2",
    "M11 5h9",
  ],
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
  pizza:
    "M12 3 3.5 19.5c5.5 2 11.5 2 17 0zM5.5 15.5c4 1.4 9 1.4 13 0M10.5 10h.01M13.5 13h.01M10 15h.01",
  bowl: "M3 11h18a9 9 0 0 1-18 0zM9 7.5c0-1.5 1-2 1-3.5M14 7.5c0-1.5 1-2 1-3.5",
  jar: "M7 3h10v3H7zM6 6h12v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1zM6 11h12",
  pastry: "M5 4h14v16H5zM8 7.5h8v9H8zM10.5 10h.01M13.5 12h.01M11 14h.01",
} as const;

export type FoodShape = keyof typeof SHAPES;

export const FOOD_ICONS: Record<string, FoodShape> = {
  // Aisles
  beef: "meat",
  chicken: "chicken",
  pork: "bacon",
  "turkey-aisle": "turkey",
  "lamb-aisle": "meat",
  "fish-and-seafood": "seafood",
  "milk-aisle": "milk",
  "cream-aisle": "milk",
  "butter-aisle": "butter",
  "yogurt-aisle": "yogurt",
  "ice-cream-aisle": "iceCream",
  cheese: "cheese",
  "eggs-aisle": "egg",
  condiments: "bottle",
  "dips-and-spreads": "dip",
  chocolate: "chocolate",
  candy: "candy",
  desserts: "cake",
  bakery: "bread",
  "pizza-aisle": "pizza",
  "toaster-pastries-aisle": "pastry",
  meals: "bowl",
  sauces: "jar",
  // Foods
  "ground-beef": "meat",
  "beef-burgers": "burger",
  meatballs: "meat",
  "hot-dogs": "sausage",
  steak: "meat",
  "beef-deli-slices": "meat",
  "chicken-nuggets": "nugget",
  "grilled-chicken-strips": "chicken",
  "chicken-patties": "burger",
  "chicken-tenders": "nugget",
  "boneless-wings": "chicken",
  "chicken-bites": "nugget",
  bacon: "bacon",
  "breakfast-sausage": "sausage",
  chorizo: "sausage",
  "italian-sausage": "sausage",
  "dinner-sausages": "sausage",
  "turkey-roast": "turkey",
  "turkey-deli-slices": "turkey",
  "fish-fillets": "seafood",
  milk: "milk",
  "chocolate-milk": "milk",
  eggnog: "milk",
  "bottled-lattes": "milk",
  "coffee-creamer": "milk",
  "half-and-half": "milk",
  "sour-cream": "yogurt",
  "whipped-cream": "milk",
  "heavy-cream": "milk",
  butter: "butter",
  yogurt: "yogurt",
  "greek-yogurt": "yogurt",
  "ice-cream": "iceCream",
  cheddar: "cheese",
  mozzarella: "cheese",
  "smoked-gouda": "cheese",
  "american-cheese": "cheese",
  "mexican-blend": "cheese",
  parmesan: "cheese",
  "swiss-cheese": "cheese",
  feta: "cheese",
  "cream-cheese": "cheese",
  queso: "dip",
  tzatziki: "dip",
  "milk-chocolate": "chocolate",
  "peanut-butter-cups": "cup",
  "candy-bars": "chocolate",
  "gummy-candy": "candy",
  marshmallows: "candy",
  "pudding-cups": "yogurt",
  "chocolate-chips": "chocolate",
  "candy-coated-chocolates": "candy",
  caramels: "candy",
  cookies: "cookie",
  cake: "cake",
  muffins: "cup",
  "cinnamon-rolls": "swirl",
  "pies-and-cheesecake": "cheese",
  "baking-mixes": "pantry",
  pizza: "pizza",
  "corn-dogs": "sausage",
  "canned-roast-beef": "meat",
  "shredded-chicken": "chicken",
  "chicken-breasts": "chicken",
  "pulled-pork": "meat",
  ribs: "meat",
  "ham-roast": "meat",
  "ham-deli-slices": "meat",
  "salami-deli-slices": "sausage",
  "luncheon-meat": "meat",
  ricotta: "cheese",
  provolone: "cheese",
  "soft-cheese": "cheese",
  "italian-blend": "cheese",
  "cheddar-mozzarella-blend": "cheese",
  "green-goddess-dressing": "bottle",
  "thousand-island-dressing": "bottle",
  kimchi: "jar",
  "chocolate-peanut-spread": "pantry",
  "hot-cocoa-mix": "cup",
  "caramel-cups": "cup",
  "fruit-chews": "candy",
  "gelatin-cups": "yogurt",
  "toaster-pastries": "pastry",
  "mac-and-cheese": "bowl",
  "skillet-meals": "bowl",
  "jamaican-beef-patties": "bread",
  "breakfast-burritos": "bread",
  lasagna: "bowl",
  "cheese-ravioli": "bowl",
  dumplings: "bowl",
  "alfredo-sauce": "jar",
  "creamy-pasta-sauce": "jar",
  pesto: "jar",
  "vodka-sauce": "jar",
  gravy: "jar",
  bouillon: "pantry",
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
