import { EUROPEAN_FRENCH_NAMES } from "./european-french-names";
import { FRENCH_NAMES } from "./french-names";
import { AUSTRIAN_NAMES, GERMAN_NAMES, SWISS_NAMES } from "./german-names";
import { ITALIAN_NAMES } from "./italian-names";
import { PORTUGAL_NAMES, PORTUGUESE_NAMES } from "./portuguese-names";
import { SPAIN_NAMES, SPANISH_NAMES } from "./spanish-names";
import { CHINESE_NAMES } from "./chinese-names";
import { JAPANESE_NAMES } from "./japanese-names";
import { KOREAN_NAMES } from "./korean-names";
import { SEARCH_INDEX_STATEMENTS } from "../../server/catalog/infrastructure/search-index";
import { DEFAULT_DIMENSIONS } from "../../server/ratings/domain/details";

// Production-safe taxonomy: real conventional foods and search aliases only.
// No products, ratings, people or images. Reviewed before any production use.
// Food → aisle → food (confirmed by the owner on 2026-10-12, milestone 7).
// Aisles are non-rankable groups shared by every country; an aisle whose
// natural slug belongs to a food takes `-aisle`. Each country orders its
// aisles by popularity; `position` is the default store order before a
// country has ratings (owner decision, 2026-10-12).
export const TAXONOMY_GROUPS = [
  { slug: "food", name: "Food", parent: null },
  { slug: "beef", name: "Beef", parent: "food", position: 1 },
  { slug: "chicken", name: "Chicken", parent: "food", position: 2 },
  { slug: "pork", name: "Pork", parent: "food", position: 3 },
  { slug: "turkey-aisle", name: "Turkey", parent: "food", position: 4 },
  { slug: "lamb-aisle", name: "Lamb", parent: "food", position: 5 },
  {
    slug: "fish-and-seafood",
    name: "Fish and seafood",
    parent: "food",
    position: 6,
  },
  { slug: "milk-aisle", name: "Milk", parent: "food", position: 7 },
  { slug: "cream-aisle", name: "Cream", parent: "food", position: 8 },
  { slug: "butter-aisle", name: "Butter", parent: "food", position: 9 },
  { slug: "yogurt-aisle", name: "Yogurt", parent: "food", position: 10 },
  { slug: "ice-cream-aisle", name: "Ice cream", parent: "food", position: 11 },
  { slug: "cheese", name: "Cheese", parent: "food", position: 12 },
  { slug: "eggs-aisle", name: "Eggs", parent: "food", position: 13 },
  { slug: "condiments", name: "Condiments", parent: "food", position: 14 },
  // Aisles follow how a food is used, not what the original is made from:
  // mayonnaise is a condiment and tzatziki a dip, the way stores shelve them
  // (owner decision, 2026-10-12).
  {
    slug: "dips-and-spreads",
    name: "Dips and spreads",
    parent: "food",
    position: 15,
  },
  // Sweets split by what they are: anything chocolate comes first goes in
  // Chocolate, the rest of the candy in Candy (owner decision, 2026-10-12).
  { slug: "chocolate", name: "Chocolate", parent: "food", position: 16 },
  { slug: "candy", name: "Candy", parent: "food", position: 17 },
  // Sweet desserts and bread-like bakes are two aisles, split from one
  // "Bakery and desserts" aisle (owner decision, 2026-10-15).
  { slug: "desserts", name: "Desserts", parent: "food", position: 18 },
  { slug: "bakery", name: "Bakery", parent: "food", position: 19 },
  // Its own aisle, the way stores keep a frozen pizza section (owner
  // decision, 2026-10-15).
  {
    slug: "toaster-pastries-aisle",
    name: "Toaster Pastries",
    parent: "food",
    position: 20,
  },
  { slug: "pizza-aisle", name: "Pizza", parent: "food", position: 21 },
  // Prepared dishes and sauces whose originals are made with meat or dairy
  // (owner decision, 2026-10-16).
  { slug: "meals", name: "Meals", parent: "food", position: 22 },
  { slug: "sauces", name: "Sauces", parent: "food", position: 23 },
] as const;
// The United States launch foods (milestone 7) start only there; a food
// switches on elsewhere when a product for it is published there.
const US = ["US"] as const;
export const TAXONOMY_LEAVES = [
  // Distinct baked foods and meal recipes keep their own comparisons.
  {
    slug: "cheesecake",
    name: "Cheesecake",
    parent: "desserts",
    aliases: ["cheese cake", "cheesecake bites"],
    countries: US,
  },
  {
    slug: "brownies",
    name: "Brownies",
    parent: "desserts",
    aliases: ["brownie"],
    countries: US,
  },
  {
    slug: "blondies",
    name: "Blondies",
    parent: "desserts",
    aliases: ["blondie"],
    countries: US,
  },
  {
    slug: "banana-bread",
    name: "Banana Bread",
    parent: "bakery",
    aliases: ["banana loaf"],
    countries: US,
  },
  {
    slug: "chili",
    name: "Chili",
    parent: "meals",
    aliases: ["chilli", "meat chili", "chicken chili", "chicken chilli"],
    countries: US,
  },
  {
    slug: "chicken-pasta",
    name: "Chicken Pasta",
    parent: "meals",
    aliases: ["chicken penne", "chicken rotini"],
    countries: US,
  },
  {
    slug: "chicken-and-chickpeas",
    name: "Chicken and Chickpeas",
    parent: "meals",
    aliases: ["mediterranean chicken and chickpeas"],
    countries: US,
  },
  {
    slug: "ground-beef",
    name: "Ground Beef",
    parent: "beef",
    aliases: ["mince", "ground meat", "beef crumbles"],
    // Each country's own name for the food; the URL stays the same.
    displayNames: {
      GB: "Beef mince",
      AU: "Beef mince",
      NZ: "Beef mince",
      IE: "Beef mince",
    },
  },
  {
    slug: "beef-burgers",
    name: "Beef Burgers",
    parent: "beef",
    aliases: ["hamburgers", "burger patties", "veggie burgers"],
  },
  {
    slug: "meatballs",
    name: "Meatballs",
    parent: "beef",
    aliases: ["meatless meatballs"],
    countries: US,
  },
  {
    slug: "hot-dogs",
    name: "Hot Dogs",
    parent: "beef",
    aliases: ["franks", "frankfurters", "wieners", "veggie dogs"],
    countries: US,
  },
  // Foods added from the first photo batch (owner decision, 2026-10-15).
  // Deli meats sit in their animal's aisle as "[Animal] Deli Slices".
  {
    slug: "steak",
    name: "Steak",
    parent: "beef",
    aliases: ["steak strips", "steak tips", "beef strips", "bulgogi"],
    countries: US,
  },
  {
    slug: "beef-deli-slices",
    name: "Beef Deli Slices",
    parent: "beef",
    aliases: ["roast beef slices", "deli beef", "pastrami", "deli steak"],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "corn-dogs",
    name: "Corn Dogs",
    parent: "beef",
    aliases: ["corn dog"],
    countries: US,
  },
  {
    slug: "canned-roast-beef",
    name: "Canned Roast Beef",
    parent: "beef",
    aliases: ["canned beef"],
    countries: US,
  },
  {
    slug: "beef-jerky",
    name: "Beef Jerky",
    parent: "beef",
    aliases: ["jerky", "plant-based jerky", "vegan jerky"],
    countries: US,
  },
  {
    slug: "chicken-nuggets",
    name: "Chicken Nuggets",
    parent: "chicken",
    aliases: ["nuggets", "chick'n nuggets"],
  },
  {
    slug: "grilled-chicken-strips",
    name: "Grilled Chicken Strips",
    parent: "chicken",
    aliases: ["chicken strips", "chicken pieces", "chick'n strips"],
    countries: US,
  },
  {
    slug: "chicken-patties",
    name: "Chicken Patties",
    parent: "chicken",
    aliases: ["chicken fillets", "chicken sandwich patties"],
    countries: US,
  },
  {
    slug: "chicken-tenders",
    name: "Chicken Tenders",
    parent: "chicken",
    aliases: ["chicken fingers", "tenders"],
    countries: US,
  },
  {
    slug: "boneless-wings",
    name: "Boneless Wings",
    parent: "chicken",
    aliases: ["buffalo wings", "chicken wings", "wings"],
    countries: US,
  },
  // Unbreaded pieces, usually in a sauce (owner decision, 2026-10-15).
  {
    slug: "chicken-bites",
    name: "Chicken Bites",
    parent: "chicken",
    aliases: [
      "chicken chunks",
      "orange chicken",
      "kung pao chicken",
      "sesame chicken",
    ],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "shredded-chicken",
    name: "Shredded Chicken",
    parent: "chicken",
    aliases: ["pulled chicken", "chicken shreds"],
    countries: US,
  },
  {
    slug: "chicken-breasts",
    name: "Chicken Breasts",
    parent: "chicken",
    aliases: ["chicken breast", "chicken cutlets"],
    countries: US,
  },
  { slug: "bacon", name: "Bacon", parent: "pork", aliases: ["bacon strips"] },
  {
    slug: "breakfast-sausage",
    name: "Breakfast Sausage",
    parent: "pork",
    aliases: ["sausage links", "sausage patties"],
    countries: US,
  },
  {
    slug: "chorizo",
    name: "Chorizo",
    parent: "pork",
    aliases: ["soyrizo", "Mexican chorizo"],
    countries: US,
  },
  {
    slug: "italian-sausage",
    name: "Italian Sausage",
    parent: "pork",
    aliases: ["sweet Italian sausage", "mild Italian sausage"],
    countries: US,
  },
  // Dinner links that are neither breakfast nor Italian (owner decision,
  // 2026-10-15).
  {
    slug: "dinner-sausages",
    name: "Dinner Sausages",
    parent: "pork",
    aliases: ["bratwurst", "brats", "kielbasa", "smoked sausage"],
    countries: US,
  },
  {
    slug: "pepperoni",
    name: "Pepperoni",
    parent: "pork",
    aliases: ["pepperoni slices", "plant-based pepperoni", "vegan pepperoni"],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "pulled-pork",
    name: "Pulled Pork",
    parent: "pork",
    aliases: ["BBQ pulled pork", "carnitas"],
    countries: US,
  },
  {
    slug: "ribs",
    name: "Ribs",
    parent: "pork",
    aliases: ["riblets", "BBQ ribs"],
    countries: US,
  },
  {
    slug: "ham-roast",
    name: "Ham Roast",
    parent: "pork",
    aliases: ["holiday ham", "glazed ham"],
    countries: US,
  },
  {
    slug: "ham-deli-slices",
    name: "Ham Deli Slices",
    parent: "pork",
    aliases: ["ham slices", "deli ham", "Black Forest ham"],
    countries: US,
  },
  {
    slug: "salami-deli-slices",
    name: "Salami Deli Slices",
    parent: "pork",
    aliases: ["salami", "deli salami"],
    countries: US,
  },
  {
    slug: "luncheon-meat",
    name: "Luncheon Meat",
    parent: "pork",
    aliases: ["luncheon loaf", "canned meat"],
    countries: US,
  },
  {
    slug: "lard",
    name: "Lard",
    parent: "pork",
    aliases: ["pork lard", "animal shortening"],
    countries: US,
  },
  {
    slug: "turkey-roast",
    name: "Turkey Roast",
    parent: "turkey-aisle",
    aliases: ["holiday roast", "Thanksgiving roast"],
    countries: US,
    season: { start: 10, end: 12 },
  },
  {
    slug: "turkey-deli-slices",
    name: "Turkey Deli Slices",
    parent: "turkey-aisle",
    aliases: ["turkey slices", "deli turkey"],
    countries: US,
  },
  {
    slug: "fish-fillets",
    name: "Fish Fillets",
    parent: "fish-and-seafood",
    aliases: ["fish sticks", "fish fingers", "breaded fish"],
    countries: US,
  },
  {
    slug: "milk",
    name: "Milk",
    parent: "milk-aisle",
    aliases: ["plant milk", "non-dairy milk", "barista milk"],
  },
  {
    slug: "chocolate-milk",
    name: "Chocolate Milk",
    parent: "milk-aisle",
    aliases: [],
    countries: US,
  },
  {
    slug: "eggnog",
    name: "Eggnog",
    parent: "milk-aisle",
    aliases: ["nog", "holiday nog"],
    countries: US,
    season: { start: 11, end: 1 },
  },
  // Ready-to-drink coffee made with milk (owner decision, 2026-10-15).
  {
    slug: "bottled-lattes",
    name: "Bottled Lattes",
    parent: "milk-aisle",
    aliases: ["iced latte", "iced coffee", "latte", "ready-to-drink coffee"],
    countries: US,
  },
  {
    slug: "coffee-creamer",
    name: "Coffee Creamer",
    parent: "cream-aisle",
    aliases: ["creamer", "non-dairy creamer"],
    countries: US,
  },
  {
    slug: "half-and-half",
    name: "Half-and-Half",
    parent: "cream-aisle",
    aliases: [],
    countries: US,
  },
  {
    slug: "sour-cream",
    name: "Sour Cream",
    parent: "cream-aisle",
    aliases: [],
    countries: US,
  },
  {
    slug: "whipped-cream",
    name: "Whipped Cream",
    parent: "cream-aisle",
    aliases: ["whipped topping"],
    countries: US,
  },
  {
    slug: "heavy-cream",
    name: "Heavy Cream",
    parent: "cream-aisle",
    aliases: ["heavy whipping cream", "whipping cream", "cooking cream"],
    countries: US,
  },
  {
    slug: "butter",
    name: "Butter",
    parent: "butter-aisle",
    aliases: ["buttery spread", "butter spray"],
  },
  {
    slug: "yogurt",
    name: "Yogurt",
    parent: "yogurt-aisle",
    aliases: ["yoghurt", "dairy-free yogurt"],
    countries: US,
  },
  {
    slug: "greek-yogurt",
    name: "Greek Yogurt",
    parent: "yogurt-aisle",
    aliases: ["Greek-style yogurt", "Greek yoghurt"],
    countries: US,
  },
  {
    slug: "ice-cream",
    name: "Ice Cream",
    parent: "ice-cream-aisle",
    aliases: ["frozen dessert", "non-dairy ice cream"],
    countries: US,
  },
  {
    slug: "cheddar",
    name: "Cheddar",
    parent: "cheese",
    aliases: ["cheddar cheese"],
  },
  {
    slug: "cheese-slices",
    name: "Cheese Slices",
    parent: "cheese",
    aliases: ["sliced cheese", "cheese slices"],
    countries: US,
  },
  {
    slug: "mozzarella",
    name: "Mozzarella",
    parent: "cheese",
    aliases: ["mozzarella cheese"],
  },
  {
    slug: "smoked-gouda",
    name: "Smoked Gouda",
    parent: "cheese",
    aliases: ["gouda"],
    countries: US,
  },
  {
    slug: "american-cheese",
    name: "American Cheese",
    parent: "cheese",
    aliases: ["American slices", "American singles"],
    countries: US,
  },
  {
    slug: "mexican-blend",
    name: "Mexican Blend",
    parent: "cheese",
    aliases: ["Mexican cheese", "taco cheese", "Mexican shreds"],
    countries: US,
  },
  {
    slug: "parmesan",
    name: "Parmesan",
    parent: "cheese",
    aliases: ["parm", "parmigiano", "grated parmesan"],
    countries: US,
  },
  // More cheeses join as products are found (owner decision, 2026-10-15).
  {
    slug: "swiss-cheese",
    name: "Swiss Cheese",
    parent: "cheese",
    aliases: ["Swiss", "Swiss slices", "Emmental"],
    countries: US,
  },
  {
    slug: "feta",
    name: "Feta",
    parent: "cheese",
    aliases: ["feta cheese", "feta crumbles"],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "ricotta",
    name: "Ricotta",
    parent: "cheese",
    aliases: ["ricotta cheese"],
    countries: US,
  },
  {
    slug: "provolone",
    name: "Provolone",
    parent: "cheese",
    aliases: ["provolone cheese", "smoked provolone"],
    countries: US,
  },
  {
    slug: "soft-cheese",
    name: "Soft Cheese",
    parent: "cheese",
    aliases: [
      "brie",
      "camembert",
      "goat cheese",
      "cheese wedges",
      "soft-ripened cheese",
    ],
    countries: US,
  },
  {
    slug: "italian-blend",
    name: "Italian Blend",
    parent: "cheese",
    aliases: ["Italian cheese blend", "pizza cheese"],
    countries: US,
  },
  {
    slug: "cheddar-mozzarella-blend",
    name: "Cheddar Mozzarella Blend",
    parent: "cheese",
    aliases: ["cheddar mozzarella", "mozzarella cheddar blend"],
    countries: US,
  },
  {
    slug: "cream-cheese",
    name: "Cream Cheese",
    parent: "cheese",
    aliases: ["cream cheese spread"],
  },
  {
    slug: "eggs",
    name: "Eggs",
    parent: "eggs-aisle",
    // Cooked eggs (scrambled, folded); baking replacers are their own food.
    aliases: ["egg alternatives", "scrambled eggs"],
  },
  {
    slug: "eggs-for-baking",
    name: "Eggs for Baking",
    parent: "eggs-aisle",
    aliases: ["egg replacer", "egg substitute"],
    countries: US,
  },
  {
    slug: "mayonnaise",
    name: "Mayonnaise",
    parent: "condiments",
    aliases: ["mayo", "aioli", "egg-free mayo", "eggless mayo"],
    countries: US,
  },
  {
    slug: "ranch-dressing",
    name: "Ranch Dressing",
    parent: "condiments",
    aliases: ["ranch"],
    countries: US,
  },
  {
    slug: "blue-cheese-dressing",
    name: "Blue Cheese Dressing",
    parent: "condiments",
    aliases: ["bleu cheese dressing", "blue cheese", "bleu cheese"],
    countries: US,
  },
  {
    slug: "honey-mustard-dressing",
    name: "Honey Mustard Dressing",
    parent: "condiments",
    aliases: ["honey mustard", "honey mustard salad dressing"],
    countries: US,
  },
  {
    slug: "caesar-dressing",
    name: "Caesar Dressing",
    parent: "condiments",
    aliases: ["caesar"],
    countries: US,
  },
  {
    slug: "worcestershire-sauce",
    name: "Worcestershire Sauce",
    parent: "condiments",
    aliases: ["worcestershire", "worcester sauce"],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "green-goddess-dressing",
    name: "Green Goddess Dressing",
    parent: "condiments",
    aliases: ["green goddess"],
    countries: US,
  },
  {
    slug: "thousand-island-dressing",
    name: "Thousand Island Dressing",
    parent: "condiments",
    aliases: ["thousand island", "burger sauce"],
    countries: US,
  },
  // Traditional kimchi is made with fish sauce or shrimp (owner decision,
  // 2026-10-16).
  {
    slug: "kimchi",
    name: "Kimchi",
    parent: "condiments",
    aliases: ["kimchee", "vegan kimchi"],
    countries: US,
  },
  // Queso moved here from Cheese: stores shelve it with the dips.
  {
    slug: "queso",
    name: "Queso",
    parent: "dips-and-spreads",
    aliases: ["nacho cheese dip", "cheese dip", "cheese sauce"],
    countries: US,
  },
  {
    slug: "tzatziki",
    name: "Tzatziki",
    parent: "dips-and-spreads",
    aliases: ["yogurt dip", "cucumber dip", "tzatziki dip"],
    countries: US,
  },
  {
    slug: "dairy-based-dips",
    name: "Creamy Dips",
    parent: "dips-and-spreads",
    aliases: [
      "dairy-based dips",
      "almond-based dip",
      "almond-based dips",
      "creamy dairy-free dips",
    ],
    countries: US,
  },
  {
    slug: "spinach-artichoke-dip",
    name: "Spinach Artichoke Dip",
    parent: "dips-and-spreads",
    aliases: ["spinach dip", "artichoke dip", "spinach artichoke"],
    countries: US,
  },
  {
    slug: "milk-chocolate",
    name: "Milk Chocolate",
    parent: "chocolate",
    aliases: ["chocolate bar", "milk chocolate bar", "oat milk chocolate"],
    countries: US,
  },
  {
    slug: "chocolate-chips",
    name: "Chocolate Chips",
    parent: "chocolate",
    aliases: ["chocolate morsels", "baking chips", "milk chocolate chips"],
    countries: US,
  },
  {
    slug: "peanut-butter-cups",
    name: "Nut Butter Cups",
    parent: "chocolate",
    aliases: [
      "peanut butter cup",
      "peanut butter cups",
      "pb cups",
      "sunflower butter cups",
      "seed butter cups",
    ],
    countries: US,
  },
  {
    slug: "candy-bars",
    name: "Candy Bars",
    parent: "chocolate",
    aliases: ["filled chocolate bars", "wafer bars", "nougat bars"],
    countries: US,
  },
  {
    slug: "candy-coated-chocolates",
    name: "Candy-Coated Chocolates",
    parent: "chocolate",
    aliases: ["chocolate candies", "candy coated chocolate", "chocolate gems"],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "chocolate-peanut-spread",
    name: "Chocolate Spread",
    parent: "chocolate",
    aliases: [
      "peanut chocolate spread",
      "chocolate peanut butter spread",
      "chocolate hazelnut spread",
      "hazelnut chocolate spread",
      "chocolate nut butter spread",
      "chocolate nut spread",
      "nutella-style spread",
    ],
    countries: US,
  },
  {
    slug: "hot-cocoa-mix",
    name: "Hot Cocoa Mix",
    parent: "chocolate",
    aliases: ["hot chocolate", "hot cocoa", "cocoa mix"],
    countries: US,
  },
  {
    slug: "caramel-cups",
    name: "Caramel Cups",
    parent: "chocolate",
    aliases: ["chocolate caramel cups", "caramel chocolate cups"],
    countries: US,
  },
  // Gummies made without gelatin, including ones that were always
  // gelatin-free: most gummies contain gelatin (owner, 2026-10-15).
  {
    slug: "gummy-candy",
    name: "Gummy Candy",
    parent: "candy",
    aliases: ["gummy bears", "gummy worms", "gummies", "gelatin-free gummies"],
    countries: US,
  },
  {
    slug: "marshmallows",
    name: "Marshmallows",
    parent: "candy",
    aliases: ["marshmallow", "gelatin-free marshmallows"],
    countries: US,
  },
  {
    slug: "caramels",
    name: "Caramels",
    parent: "candy",
    aliases: ["caramel candy", "chewy caramels", "caramel chews"],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "fruit-chews",
    name: "Fruit Chews",
    parent: "candy",
    aliases: ["taffy", "chewy candy", "fruit chew candy"],
    countries: US,
  },
  {
    slug: "cookies",
    name: "Cookies",
    parent: "desserts",
    // Cookie dough is compared with the dough it replaces, but stays a
    // cookie (owner decision, 2026-10-15).
    aliases: [
      "cookie",
      "chocolate chip cookies",
      "bakery cookies",
      "cookie dough",
    ],
    countries: US,
  },
  // Banana bread is a loaf cake here until it has products of its own.
  {
    slug: "cake",
    name: "Cake",
    parent: "desserts",
    aliases: [
      "cupcakes",
      "chocolate cake",
      "layer cake",
      "pound cake",
      "loaf cake",
    ],
    countries: US,
  },
  {
    slug: "muffins",
    name: "Muffins",
    parent: "bakery",
    aliases: ["muffin"],
    countries: US,
  },
  {
    slug: "pumpkin-bread",
    name: "Pumpkin Bread",
    parent: "bakery",
    aliases: ["pumpkin loaf", "pumpkin quick bread"],
    countries: US,
  },
  {
    slug: "scones",
    name: "Scones",
    parent: "bakery",
    aliases: ["scone"],
    countries: US,
  },
  {
    slug: "cinnamon-rolls",
    name: "Cinnamon Rolls",
    parent: "bakery",
    aliases: ["cinnamon roll", "cinnamon buns"],
    countries: US,
  },
  // Broad while each kind has few products. Frozen and bakery pies are the
  // same food; a brand's frozen pie and a store's bakery pie are separate
  // lines anyway.
  {
    slug: "fruit-pies",
    name: "Fruit Pies",
    parent: "desserts",
    aliases: ["pie", "pumpkin pie"],
    countries: US,
  },
  {
    slug: "pudding-cups",
    name: "Pudding Cups",
    parent: "desserts",
    aliases: ["pudding", "chocolate pudding"],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "gelatin-cups",
    name: "Gelatin Cups",
    parent: "desserts",
    aliases: ["gelatin dessert", "jello cups", "jelly cups"],
    countries: US,
  },
  // Mixes bake at home, so they are compared with what a regular box mix
  // bakes, not with bakery goods. One food until each kind has enough.
  {
    slug: "baking-mixes",
    name: "Baking Mixes",
    parent: "bakery",
    aliases: ["cake mix", "brownie mix", "cookie mix", "muffin mix", "box mix"],
    countries: US,
  },
  {
    slug: "pizza",
    name: "Pizza",
    parent: "pizza-aisle",
    aliases: [
      "frozen pizza",
      "cheese pizza",
      "pepperoni pizza",
      "flatbread pizza",
    ],
    countries: US,
  },
  // Added from the full photo batch (owner decision, 2026-10-16).
  {
    slug: "toaster-pastries",
    name: "Toaster Pastries",
    parent: "toaster-pastries-aisle",
    aliases: ["toaster tarts", "breakfast pastries", "frosted pastries"],
    countries: US,
  },
  {
    slug: "mac-and-cheese",
    name: "Mac and Cheese",
    parent: "meals",
    aliases: ["mac & cheese", "macaroni and cheese", "mac n cheese"],
    countries: US,
  },
  {
    slug: "chicken-stir-fry",
    name: "Chicken Stir-Fry",
    parent: "meals",
    aliases: ["chicken stir fry", "teriyaki chicken stir fry"],
    countries: US,
  },
  {
    slug: "jamaican-beef-patties",
    name: "Jamaican Beef Patties",
    parent: "meals",
    aliases: ["beef patties", "Jamaican patties"],
    countries: US,
  },
  {
    slug: "jambalaya",
    name: "Jambalaya",
    parent: "meals",
    aliases: ["cajun jambalaya"],
    countries: US,
  },
  {
    slug: "breakfast-burritos",
    name: "Breakfast Burritos",
    parent: "meals",
    aliases: ["breakfast burrito"],
    countries: US,
  },
  {
    slug: "lasagna",
    name: "Lasagna",
    parent: "meals",
    aliases: ["lasagne"],
    countries: US,
  },
  {
    slug: "cheese-ravioli",
    name: "Cheese-Filled Pasta",
    parent: "meals",
    aliases: [
      "ravioli",
      "cheese ravioli",
      "tortellini",
      "cheese tortellini",
      "stuffed pasta",
      "filled pasta",
    ],
    countries: US,
  },
  {
    slug: "breakfast-sandwich",
    name: "Breakfast Sandwich",
    parent: "meals",
    aliases: ["sausage egg and cheese sandwich", "vegan breakfast sandwich"],
    countries: US,
  },
  {
    slug: "chicken-rice-meal",
    name: "Chicken and Rice Meal",
    parent: "meals",
    aliases: ["chicken and rice", "chicken rice bowl"],
    countries: US,
  },
  {
    slug: "chicken-noodle-soup",
    name: "Chicken Noodle Soup",
    parent: "meals",
    aliases: ["chicken soup", "chicken noodle"],
    countries: US,
  },
  {
    slug: "thai-curry-roti",
    name: "Thai Curry Roti",
    parent: "meals",
    aliases: ["curry roti", "thai curry wrap"],
    countries: US,
  },
  {
    slug: "korean-rice-rolls",
    name: "Korean Rice Rolls",
    parent: "meals",
    aliases: ["kimbap", "gimbap", "kim bap"],
    countries: US,
  },
  {
    slug: "korean-stir-fried-rice-cakes",
    name: "Korean Stir-Fried Rice Cakes",
    parent: "meals",
    aliases: ["tteokbokki", "tteok-bokki", "topokki"],
    countries: US,
  },
  {
    slug: "korean-rice-balls",
    name: "Korean Rice Balls",
    parent: "meals",
    aliases: ["jumeokbap", "korean rice ball"],
    countries: US,
  },
  {
    slug: "milkshake",
    name: "Milkshake",
    parent: "ice-cream-aisle",
    aliases: ["milk shakes", "milk shake", "dairy milkshake"],
    countries: US,
  },
  {
    slug: "dumplings",
    name: "Dumplings",
    parent: "meals",
    aliases: ["potstickers", "gyoza", "dim sum"],
    countries: US,
  },
  {
    slug: "alfredo-sauce",
    name: "Alfredo Sauce",
    parent: "sauces",
    aliases: ["alfredo", "cream sauce"],
    countries: US,
  },
  {
    slug: "creamy-pasta-sauce",
    name: "Creamy Pasta Sauce",
    parent: "sauces",
    aliases: ["cream pasta sauce", "ros\u00e9 sauce"],
    countries: US,
  },
  {
    slug: "pesto",
    name: "Pesto",
    parent: "sauces",
    aliases: ["basil pesto", "pesto sauce"],
    countries: US,
  },
  {
    slug: "vodka-sauce",
    name: "Vodka Sauce",
    parent: "sauces",
    aliases: ["vodka pasta sauce", "penne alla vodka sauce"],
    countries: US,
  },
  {
    slug: "gravy",
    name: "Gravy",
    parent: "sauces",
    aliases: ["brown gravy", "beef gravy", "gravy mix"],
    countries: US,
  },
  {
    slug: "bouillon",
    name: "Bouillon",
    parent: "sauces",
    aliases: ["broth", "stock", "bouillon cubes", "soup base"],
    countries: US,
  },
] as const;

// Owner-approved consolidation of names that already exist in earlier
// catalogs. These use the audited taxonomy update path so the change can be
// reversed without replacing operator-edited names elsewhere.
export const TAXONOMY_RENAMES = [
  { slug: "cheese-ravioli", name: "Cheese-Filled Pasta" },
  { slug: "chocolate-peanut-spread", name: "Chocolate Spread" },
  { slug: "peanut-butter-cups", name: "Nut Butter Cups" },
] as const;

// The main foods' detail questions (owner decisions, 2026-10-09; Milk and
// Eggs revised on 2026-10-12). Every other food asks Taste and Texture.
export const TAXONOMY_DIMENSIONS: Record<
  string,
  [key: string, label: string][]
> = {
  "ground-beef": [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["browning", "Browning"],
  ],
  "beef-burgers": [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["juiciness", "Juiciness"],
  ],
  "chicken-nuggets": [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["crispiness", "Crispiness"],
  ],
  bacon: [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["crispiness", "Crispiness"],
  ],
  milk: [
    ["taste", "Taste"],
    ["creaminess", "Creaminess"],
    ["hot_drinks", "In hot drinks"],
    ["baking", "Baking"],
  ],
  butter: [
    ["taste", "Taste"],
    ["spreading", "Spreading"],
    ["baking", "Baking"],
  ],
  cheddar: [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["melt", "Melt"],
  ],
  mozzarella: [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["melt", "Melt"],
    ["stretch", "Stretch"],
  ],
  "cream-cheese": [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["spreading", "Spreading"],
  ],
  eggs: [
    ["taste", "Taste"],
    ["texture", "Texture"],
    ["scrambling", "Scrambling"],
    ["baking", "Baking"],
  ],
};
// Regulation 1169/2011 Annex II. Switzerland's LIV Annex 6 lists the same 14.
const EUROPEAN_ALLERGENS: (string | [string, string])[] = [
  ["gluten", "Cereals containing gluten"],
  ["crustacean", "Crustaceans"],
  "egg",
  "fish",
  "peanut",
  ["soy", "Soybeans"],
  "milk",
  ["tree_nuts", "Nuts"],
  "celery",
  "mustard",
  "sesame",
  ["sulphites", "Sulphur dioxide and sulphites"],
  "lupin",
  "mollusc",
];
const IBERIAN_ALLERGENS = EUROPEAN_ALLERGENS;

// The English-speaking launch countries (owner decision, 2026-10-09). Each
// list follows that country's labeling rules (PRODUCT_MASTER, milestone 5);
// a label overrides the shared vocabulary's wording.
export const TAXONOMY_COUNTRIES: {
  iso2: string;
  name: string;
  allergens: (string | [string, string])[];
}[] = [
  {
    iso2: "US",
    name: "United States",
    allergens: [
      "milk",
      "egg",
      "fish",
      ["crustacean", "Crustacean shellfish"],
      "tree_nuts",
      "peanut",
      "wheat",
      "soy",
      "sesame",
    ],
  },
  {
    iso2: "CA",
    name: "Canada",
    allergens: [
      "peanut",
      "tree_nuts",
      "sesame",
      "milk",
      "egg",
      ["fish", "Fish"],
      ["crustacean", "Crustaceans"],
      "mollusc",
      "soy",
      ["wheat", "Wheat and triticale"],
      "mustard",
      ["gluten", "Gluten sources"],
      ["sulphites", "Added sulphites"],
    ],
  },
  {
    iso2: "GB",
    name: "United Kingdom",
    allergens: [
      "celery",
      ["gluten", "Cereals containing gluten"],
      ["crustacean", "Crustaceans"],
      "egg",
      "fish",
      "lupin",
      "milk",
      "mollusc",
      "mustard",
      ["tree_nuts", "Nuts"],
      "peanut",
      "sesame",
      ["soy", "Soya"],
      ["sulphites", "Sulphur dioxide and sulphites"],
    ],
  },
  {
    iso2: "AU",
    name: "Australia",
    allergens: [
      "milk",
      "egg",
      "peanut",
      "tree_nuts",
      "sesame",
      "soy",
      "fish",
      ["crustacean", "Crustacean"],
      ["mollusc", "Mollusc"],
      "wheat",
      ["gluten", "Gluten (barley, oats, rye)"],
      "lupin",
      ["sulphites", "Added sulphites"],
    ],
  },
  {
    iso2: "NZ",
    name: "New Zealand",
    allergens: [
      "milk",
      "egg",
      "peanut",
      "tree_nuts",
      "sesame",
      "soy",
      "fish",
      ["crustacean", "Crustacean"],
      ["mollusc", "Mollusc"],
      "wheat",
      ["gluten", "Gluten (barley, oats, rye)"],
      "lupin",
      ["sulphites", "Added sulphites"],
    ],
  },
  {
    iso2: "IE",
    name: "Ireland",
    allergens: [
      "celery",
      ["gluten", "Cereals containing gluten"],
      ["crustacean", "Crustaceans"],
      "egg",
      "fish",
      "lupin",
      "milk",
      "mollusc",
      "mustard",
      ["tree_nuts", "Nuts"],
      "peanut",
      "sesame",
      ["soy", "Soya"],
      ["sulphites", "Sulphur dioxide and sulphites"],
    ],
  },
  // Molluscs are part of the fish group in Singapore's list and are kept apart
  // here so a label naming them can be recorded.
  {
    iso2: "SG",
    name: "Singapore",
    allergens: [
      ["gluten", "Cereals containing gluten"],
      ["crustacean", "Crustaceans"],
      "egg",
      "fish",
      "mollusc",
      "peanut",
      ["soy", "Soybeans"],
      "milk",
      "tree_nuts",
      ["sulphites", "Sulphites (10 mg/kg or more)"],
    ],
  },
  {
    iso2: "ZA",
    name: "South Africa",
    allergens: [
      "egg",
      ["milk", "Cow's milk"],
      ["crustacean", "Crustaceans"],
      "mollusc",
      "fish",
      "peanut",
      ["soy", "Soybeans"],
      "tree_nuts",
      ["gluten", "Wheat, rye, barley and oats"],
    ],
  },
  // Packages declare peanuts and tree nuts together as "Nut"; they stay two
  // entries so a specific nut in the ingredient list can be recorded.
  {
    // Consumer Affairs Agency: the 9 required items, then the 20 recommended.
    iso2: "JP",
    name: "Japan",
    allergens: [
      "shrimp",
      "cashew",
      "crab",
      "walnut",
      "wheat",
      "buckwheat",
      "egg",
      "milk",
      "peanut",
      "almond",
      "abalone",
      "squid",
      "salmon_roe",
      "orange",
      "kiwi",
      "beef",
      "sesame",
      "salmon",
      "mackerel",
      "soy",
      "chicken",
      "banana",
      "pistachio",
      "pork",
      "macadamia",
      "peach",
      "yam",
      "apple",
      "gelatin",
    ],
  },
  { iso2: "DE", name: "Germany", allergens: EUROPEAN_ALLERGENS },
  { iso2: "FR", name: "France", allergens: EUROPEAN_ALLERGENS },
  { iso2: "IT", name: "Italy", allergens: EUROPEAN_ALLERGENS },
  { iso2: "AT", name: "Austria", allergens: EUROPEAN_ALLERGENS },
  { iso2: "CH", name: "Switzerland", allergens: EUROPEAN_ALLERGENS },
  { iso2: "BE", name: "Belgium", allergens: EUROPEAN_ALLERGENS },
  { iso2: "LU", name: "Luxembourg", allergens: EUROPEAN_ALLERGENS },
  {
    // NOM-051 4.2.2.2.3 a, 2020 modification, in its order. The label's words
    // are in server/catalog/domain/local-names.ts.
    iso2: "MX",
    name: "Mexico",
    allergens: [
      ["gluten", "Cereals containing gluten"],
      "egg",
      ["crustacean", "Crustaceans"],
      "fish",
      "mollusc",
      "peanut",
      "soy",
      "milk",
      "tree_nuts",
      "sulphites",
    ],
  },
  {
    // RDC 727 Annex III, in its order, with wheat, rye, barley and oats apart.
    // Gluten is last: Law 10.674 makes it a separate statement on the label.
    // Anvisa's CP 1.357/2025 would change this list; see the glossary.
    iso2: "BR",
    name: "Brazil",
    allergens: [
      "wheat",
      "rye",
      "barley",
      "oats",
      ["crustacean", "Crustaceans"],
      "egg",
      "fish",
      "peanut",
      "soy",
      "milk",
      "almond",
      "hazelnut",
      "cashew",
      "brazil_nut",
      "macadamia",
      "walnut",
      "pecan",
      "pistachio",
      "pine_nut",
      "chestnut",
      "latex",
      "gluten",
    ],
  },
  { iso2: "ES", name: "Spain", allergens: IBERIAN_ALLERGENS },
  { iso2: "PT", name: "Portugal", allergens: IBERIAN_ALLERGENS },
  {
    iso2: "IN",
    name: "India",
    allergens: [
      ["gluten", "Cereals containing gluten"],
      ["crustacean", "Crustaceans"],
      "milk",
      "egg",
      "fish",
      "peanut",
      "tree_nuts",
      "soy",
      ["sulphites", "Sulphites (10 mg/kg or more)"],
    ],
  },
  {
    // TFDA's 11 categories, in its order. Goat's milk is part of the milk item.
    iso2: "TW",
    name: "Taiwan",
    allergens: [
      ["crustacean", "Crustaceans"],
      "mango",
      "peanut",
      ["milk", "Cow's and goat's milk"],
      "egg",
      "tree_nuts",
      "sesame",
      ["gluten", "Cereals containing gluten"],
      "soy",
      "fish",
      ["sulphites", "Sulphites (10 mg/kg or more)"],
    ],
  },
  {
    // MFDS's list, in its order. The four items proposed on 2026-08-07 (sesame,
    // perilla, almond and cashew) join when the rule is final.
    iso2: "KR",
    name: "South Korea",
    allergens: [
      "egg",
      "milk",
      "buckwheat",
      "peanut",
      "soy",
      "wheat",
      "mackerel",
      "crab",
      "shrimp",
      "pork",
      "peach",
      "tomato",
      ["sulphites", "Sulphites (10 mg/kg or more)"],
      "walnut",
      "chicken",
      "beef",
      "squid",
      ["mollusc", "Shellfish (including oysters, abalone and mussels)"],
      "pine_nut",
    ],
  },
  {
    iso2: "IN",
    name: "India",
    allergens: [
      ["gluten", "Cereals containing gluten"],
      ["crustacean", "Crustaceans"],
      "milk",
      "egg",
      "fish",
      "peanut",
      "tree_nuts",
      "soy",
      ["sulphites", "Sulphites (10 mg/kg or more)"],
    ],
  },
];
// Launch foods and homepage features are for these countries only. Every other
// country starts with the shared aisles; a food switches on there when someone
// adds its first product.
const LAUNCH_COUNTRIES = ["US", "CA", "GB", "AU", "NZ", "IE"] as const;
// Countries switched on in production. The others keep their foods, allergens
// and names, and serve no pages until they join this list.
export const PRODUCTION_COUNTRIES = ["US"] as const;
export const TAXONOMY_FEATURES = [
  "ground-beef",
  "beef-burgers",
  "milk",
  "cheddar",
  "butter",
  "eggs",
] as const;

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
/**
 * Idempotent SQL keyed by slug: existing categories, aliases and configured
 * features are left untouched, so it is safe on any environment's data.
 */
export function taxonomySeedStatements(
  newId: () => string,
  now: number,
  options: {
    onlyFoods?: readonly string[];
    liveCountries?: readonly string[];
  } = {},
) {
  const onlyFoods = options.onlyFoods;
  const selectedFoods = onlyFoods
    ? TAXONOMY_LEAVES.filter((leaf) => onlyFoods.includes(leaf.slug))
    : TAXONOMY_LEAVES;
  if (
    onlyFoods &&
    (onlyFoods.length === 0 ||
      selectedFoods.length !== onlyFoods.length ||
      new Set(onlyFoods).size !== onlyFoods.length)
  )
    throw new Error(
      "The targeted taxonomy seed must name known food slugs once.",
    );
  const selectedSlugs = new Set<string>(selectedFoods.map((leaf) => leaf.slug));
  const statements: string[] = [];
  for (const country of TAXONOMY_COUNTRIES) {
    statements.push(
      `INSERT INTO countries(id,iso2,name,created_at,updated_at) VALUES(${quote(newId())},${quote(country.iso2)},${quote(country.name)},${now},${now}) ON CONFLICT DO NOTHING;`,
    );
    const list = country.allergens.map((entry, position) => {
      const [key, label] = typeof entry === "string" ? [entry, null] : entry;
      return { key, label, position: position + 1 };
    });
    statements.push(
      `INSERT INTO country_allergens(country_id,allergen_key,position,label)
      SELECT co.id,json_extract(j.value,'$.key'),json_extract(j.value,'$.position'),json_extract(j.value,'$.label')
      FROM json_each(${quote(JSON.stringify(list))}) j CROSS JOIN countries co WHERE co.iso2=${quote(country.iso2)}
      ON CONFLICT DO NOTHING;`,
    );
  }
  if (options.liveCountries)
    statements.push(
      `UPDATE countries SET is_active=iso2 IN (${options.liveCountries.map(quote).join(",")});`,
    );
  const categoriesToSeed = onlyFoods
    ? selectedFoods
    : [...TAXONOMY_GROUPS, ...selectedFoods];
  for (const category of categoriesToSeed) {
    const rankable = "aliases" in category ? 1 : 0;
    const position = "position" in category ? category.position : null;
    const season = "season" in category ? category.season : null;
    statements.push(
      `INSERT INTO categories(id,parent_id,slug,name,is_rankable,is_active,position,season_start,season_end,created_at,updated_at)
      SELECT ${quote(newId())},${category.parent ? `(SELECT id FROM categories WHERE slug=${quote(category.parent)})` : "NULL"},${quote(category.slug)},${quote(category.name)},${rankable},1,${position ?? "NULL"},${season?.start ?? "NULL"},${season?.end ?? "NULL"},${now},${now}
      WHERE NOT EXISTS(SELECT 1 FROM categories WHERE slug=${quote(category.slug)});`,
    );
    // An existing category gets a missing default position or season, unless
    // an operator has ever set that field, so their choice stays.
    const untouched = (field: string) =>
      `NOT EXISTS(SELECT 1 FROM moderation_actions a WHERE a.kind='category_update' AND a.target_id=categories.id AND json_type(a.after_data,'$.${field}') IS NOT NULL)`;
    if (position !== null)
      statements.push(
        `UPDATE categories SET position=${position} WHERE slug=${quote(category.slug)} AND position IS NULL AND ${untouched("position")};`,
      );
    if (season)
      statements.push(
        `UPDATE categories SET season_start=${season.start},season_end=${season.end} WHERE slug=${quote(category.slug)} AND season_start IS NULL AND ${untouched("seasonStart")};`,
      );
    if ("aliases" in category)
      for (const alias of category.aliases)
        statements.push(
          `INSERT INTO category_aliases(id,category_id,country_id,alias,created_at)
          SELECT ${quote(newId())},c.id,NULL,${quote(alias)},${now} FROM categories c WHERE c.slug=${quote(category.slug)}
          ON CONFLICT DO NOTHING;`,
        );
  }
  for (const leaf of selectedFoods)
    if ("displayNames" in leaf)
      for (const [iso2, name] of Object.entries(leaf.displayNames))
        statements.push(
          `INSERT INTO category_aliases(id,category_id,country_id,alias,is_display_name,created_at)
          SELECT ${quote(newId())},c.id,co.id,${quote(name)},1,${now} FROM categories c CROSS JOIN countries co
          WHERE c.slug=${quote(leaf.slug)} AND co.iso2=${quote(iso2)}
          AND NOT EXISTS(SELECT 1 FROM category_aliases a WHERE a.category_id=c.id AND a.country_id=co.id AND a.is_display_name=1)
          ON CONFLICT DO NOTHING;`,
        );
  // A language's names show on its pages; the English stays searchable.
  const names = [
    ...Object.entries(FRENCH_NAMES).map((entry) => ["fr", ...entry]),
    ...Object.entries(JAPANESE_NAMES).map((entry) => ["ja", ...entry]),
    ...Object.entries(GERMAN_NAMES).map((entry) => ["de", ...entry]),
    ...Object.entries(ITALIAN_NAMES).map((entry) => ["it", ...entry]),
    ...Object.entries(SPANISH_NAMES).map((entry) => ["es", ...entry]),
    ...Object.entries(PORTUGUESE_NAMES).map((entry) => ["pt", ...entry]),
    ...Object.entries(CHINESE_NAMES).map((entry) => ["zh", ...entry]),
    ...Object.entries(KOREAN_NAMES).map((entry) => ["ko", ...entry]),
  ] as [string, string, string][];
  for (const [language, slug, name] of names)
    if (!onlyFoods || selectedSlugs.has(slug))
      statements.push(
        `INSERT INTO category_aliases(id,category_id,country_id,alias,is_display_name,language,created_at)
        SELECT ${quote(newId())},c.id,NULL,${quote(name)},1,${quote(language)},${now} FROM categories c
        WHERE c.slug=${quote(slug)} AND c.name<>${quote(name)}
        ON CONFLICT DO NOTHING;`,
        // The same word may already be a search term, as Lasagne is.
        `UPDATE category_aliases SET is_display_name=1,language=${quote(language)}
        WHERE alias=${quote(name)} COLLATE NOCASE AND country_id IS NULL AND is_display_name=0
        AND category_id=(SELECT id FROM categories WHERE slug=${quote(slug)})
        AND NOT EXISTS(SELECT 1 FROM category_aliases d WHERE d.category_id=category_aliases.category_id AND d.country_id IS NULL AND d.language=${quote(language)} AND d.is_display_name=1);`,
      );
  // A country's own word beats its language's shared name.
  const local: [string, string[], Record<string, string>][] = [
    ["fr", ["FR", "BE", "LU", "CH"], EUROPEAN_FRENCH_NAMES],
    ["de", ["AT"], AUSTRIAN_NAMES],
    ["de", ["CH"], SWISS_NAMES],
    ["es", ["ES"], SPAIN_NAMES],
    ["pt", ["PT"], PORTUGAL_NAMES],
  ];
  for (const [language, countries, list] of local)
    for (const [slug, name] of Object.entries(list))
      if (!onlyFoods || selectedSlugs.has(slug))
        statements.push(
          `INSERT INTO category_aliases(id,category_id,country_id,alias,is_display_name,language,created_at)
          SELECT ${quote(newId())}||co.iso2,c.id,co.id,${quote(name)},1,${quote(language)},${now} FROM categories c CROSS JOIN countries co
          WHERE c.slug=${quote(slug)} AND co.iso2 IN (${countries.map(quote).join()})
          ON CONFLICT DO NOTHING;`,
        );
  // Questions are seeded only for foods that have none, so an operator's
  // list is never overwritten. SQLite reads the whole SELECT before inserting.
  const questions = (
    where: string,
    list: readonly (readonly [string, string])[],
  ) =>
    `INSERT INTO category_rating_dimensions(id,category_id,key,label,description,sort_order,is_active,created_at,updated_at)
    SELECT ${quote(`${newId()}-`)}||c.id||'-'||j.key,c.id,json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]'),NULL,j.key,1,${now},${now}
    FROM categories c CROSS JOIN json_each(${quote(JSON.stringify(list))}) j
    WHERE ${where} AND NOT EXISTS(SELECT 1 FROM category_rating_dimensions d WHERE d.category_id=c.id)
    ON CONFLICT DO NOTHING;`;
  for (const [slug, list] of Object.entries(TAXONOMY_DIMENSIONS))
    if (!onlyFoods || selectedSlugs.has(slug))
      statements.push(questions(`c.slug=${quote(slug)}`, list));
  const defaultQuestionFilter = onlyFoods
    ? `c.slug IN (${[...selectedSlugs].map(quote).join(",")})`
    : "c.is_rankable=1";
  statements.push(
    questions(
      defaultQuestionFilter,
      DEFAULT_DIMENSIONS.map(({ key, label }) => [key, label] as const),
    ),
  );
  // Each launch food is on in its launch countries: every launch country
  // unless it names its own. A food whose countries an operator has ever
  // changed is skipped, so their choices are never undone.
  const launch = selectedFoods.flatMap((leaf) =>
    ("countries" in leaf ? leaf.countries : LAUNCH_COUNTRIES).map((iso2) => [
      leaf.slug,
      iso2,
    ]),
  );
  statements.push(
    `INSERT INTO category_countries(category_id,country_id,source,created_at)
    SELECT c.id,co.id,'launch',${now} FROM json_each(${quote(JSON.stringify(launch))}) j
    JOIN categories c ON c.slug=json_extract(j.value,'$[0]') AND c.is_rankable=1
    JOIN countries co ON co.iso2=json_extract(j.value,'$[1]')
    WHERE NOT EXISTS(SELECT 1 FROM moderation_actions a WHERE a.kind='category_countries' AND a.target_id=c.id)
    ON CONFLICT DO NOTHING;`,
  );
  // Features are seeded per country, only where none are configured yet.
  if (!onlyFoods)
    statements.push(
      `INSERT INTO category_features(country_id,category_id,position,updated_at)
      SELECT co.id,c.id,j.key+1,${now} FROM json_each(${quote(JSON.stringify(TAXONOMY_FEATURES))}) j
      JOIN categories c ON c.slug=j.value AND c.is_active=1 CROSS JOIN countries co WHERE co.iso2 IN (${LAUNCH_COUNTRIES.map((iso2) => quote(iso2)).join(",")})
      AND NOT EXISTS(SELECT 1 FROM category_features f WHERE f.country_id=co.id)
      ON CONFLICT DO NOTHING;`,
    );
  return statements;
}
// The script also rebuilds the search index from canonical rows, so new foods
// and display names are searchable at once.
export const taxonomySeedSql = (
  newId: () => string,
  now: number,
  options: Parameters<typeof taxonomySeedStatements>[2] = {},
) =>
  [
    ...taxonomySeedStatements(newId, now, options),
    ...SEARCH_INDEX_STATEMENTS.map((sql) => `${sql};`),
  ].join("\n");
