import { TAXONOMY_LEAVES } from "./taxonomy";

// Approved fictional fixtures for local/staging demonstrations only.
export const SOURCE_CHECKED_AT = Date.parse("2026-10-04T00:00:00Z");
export const DEVELOPMENT_NOTICE =
  "Demo catalog: approved fictional development fixture. Images, formula details and sample ratings are illustrative, not verified manufacturer claims or organic community feedback.";

// Real conventional-food categories; fictional products below reference them.
export const seedCategories = TAXONOMY_LEAVES;

export interface SeedProduct {
  slug: string;
  brand: string;
  name: string;
  categories: readonly string[];
  source: string;
  // A recipe line shared with other products (milestone 7), named by the
  // line's first product; a product without one starts its own line.
  family?: string;
  familyName?: string;
  // The flavor on top of the line's base recipe; none is the original.
  flavor?: string;
  // Demo tasters who rated it, when the default pattern doesn't fit.
  ratings?: number;
  notes?: string;
}

export const seedProducts: readonly SeedProduct[] = [
  {
    slug: "beyond-beef",
    brand: "Beyond",
    name: "Beyond Beef",
    categories: ["ground-beef", "beef-burgers"],
    source: "https://www.beyondmeat.com/en-US/products/beyond-beef",
    notes:
      "Manufacturer describes hand-forming this ground product into burger patties.",
  },
  {
    slug: "impossible-beef",
    brand: "Impossible Foods",
    name: "Impossible Beef Meat From Plants",
    categories: ["ground-beef"],
    source: "https://impossiblefoods.com/",
  },
  {
    slug: "gardein-ground",
    brand: "Gardein",
    name: "Ultimate Plant-Based Ground Be'f Crumbles",
    categories: ["ground-beef"],
    source:
      "https://www.gardein.com/beefless-and-porkless/classics/ultimate-plant-based-ground-bef-crumbles",
  },
  {
    slug: "beyond-burger",
    brand: "Beyond",
    name: "Beyond Burger",
    categories: ["beef-burgers"],
    source: "https://www.beyondmeat.com/en-US/products",
  },
  {
    slug: "impossible-burger",
    brand: "Impossible Foods",
    name: "Impossible Burger Patties Meat From Plants",
    categories: ["beef-burgers"],
    source: "https://impossiblefoods.com/",
  },
  {
    slug: "dr-praegers-perfect-burger",
    brand: "Dr. Praeger's",
    name: "Perfect Burger",
    categories: ["beef-burgers"],
    source: "https://www.drpraegers.com/products/perfect-burger",
  },
  {
    slug: "beyond-nuggets",
    brand: "Beyond",
    name: "Beyond Chicken Nuggets",
    categories: ["chicken-nuggets"],
    source: "https://www.beyondmeat.com/en-US/products",
  },
  {
    slug: "impossible-nuggets",
    brand: "Impossible Foods",
    name: "Impossible Chicken Nuggets Meat From Plants",
    categories: ["chicken-nuggets"],
    source: "https://impossiblefoods.com/",
  },
  {
    slug: "gardein-nuggets",
    brand: "Gardein",
    name: "Ultimate Breaded Plant-Based Chick'n Nuggets (Foodservice)",
    categories: ["chicken-nuggets"],
    source:
      "https://gardein.conagrafoodservice.com/chickn/gardein-ultimate-breaded-plant-based-chickn-nuggets-160-oz",
    notes:
      "Foodservice package; retail package equivalence has not been verified.",
  },
  {
    slug: "lightlife-smart-bacon",
    brand: "Lightlife",
    name: "Smart Bacon",
    categories: ["bacon"],
    source: "https://lightlife.com/product/smart-bacon/",
  },
  {
    slug: "lightlife-smoky-tempeh",
    brand: "Lightlife",
    name: "Smoky Tempeh Strips",
    categories: ["bacon"],
    source: "https://lightlife.com/product/smoky-tempeh-strips/",
  },
  {
    slug: "uptons-bacon-seitan",
    brand: "Upton's Naturals",
    name: "Bacon Seitan",
    categories: ["bacon"],
    source: "https://uptonsnaturals.com/products/bacon-seitan/",
  },
  {
    slug: "oatly-original",
    brand: "Oatly",
    name: "Oatmilk Original",
    categories: ["milk"],
    source: "https://www.oatly.com/en-us/products/oatmilk/oatmilk-32-oz",
    family: "oatly-oatmilk",
    familyName: "Oatly Oatmilk",
  },
  {
    slug: "oatly-full-fat",
    brand: "Oatly",
    name: "Oatmilk Full Fat",
    categories: ["milk"],
    source: "https://www.oatly.com/en-us/products/oatmilk",
    family: "oatly-oatmilk",
  },
  {
    slug: "silk-unsweet-soymilk",
    brand: "Silk",
    name: "Unsweet Soymilk",
    categories: ["milk"],
    source: "https://silk.com/plant-based-products/soymilk/unsweet-soymilk/",
  },
  {
    slug: "almond-breeze-unsweetened",
    brand: "Blue Diamond",
    name: "Almond Breeze Unsweetened Original (Refrigerated)",
    categories: ["milk"],
    source: "https://www.bluediamond.com/all-almond-breeze/",
  },
  {
    slug: "earth-balance-original",
    brand: "Earth Balance",
    name: "Original Buttery Spread",
    categories: ["butter"],
    source: "https://www.earthbalancenatural.com/",
  },
  {
    slug: "miyokos-salted-butter",
    brand: "Miyoko's Creamery",
    name: "Salted European Style Cashew Milk Butter",
    categories: ["butter"],
    source: "https://www.miyokos.com/collections/vegan-butter",
  },
  {
    slug: "country-crock-olive-oil",
    brand: "Country Crock",
    name: "Plant Butter Tub with Olive Oil",
    categories: ["butter"],
    source:
      "https://www.countrycrock.com/en-us/our-products/plant-butter-cream/olive-oil-spread",
  },
  {
    slug: "violife-cheddar",
    brand: "Violife",
    name: "Just Like Cheddar Shreds",
    categories: ["cheddar"],
    source: "https://www.violife.com/en-us/products/dairy-free-cheese-shreds",
  },
  {
    slug: "daiya-cheddar",
    brand: "Daiya",
    name: "Dairy-Free Cheddar Shreds",
    categories: ["cheddar"],
    source: "https://daiyafoods.com/collections/cheese",
  },
  {
    slug: "follow-your-heart-cheddar",
    brand: "Follow Your Heart",
    name: "Dairy-Free Cheddar Style Shredded",
    categories: ["cheddar"],
    source:
      "https://www.followyourheart.com/vegan-foods/dairy-free-cheese/shredded-cheese/",
  },
  {
    slug: "violife-mozzarella",
    brand: "Violife",
    name: "Just Like Mozzarella Shreds",
    categories: ["mozzarella"],
    source: "https://www.violife.com/en-us/products/dairy-free-cheese-shreds",
  },
  {
    slug: "daiya-mozzarella",
    brand: "Daiya",
    name: "Dairy-Free Mozzarella Shreds",
    categories: ["mozzarella"],
    source: "https://daiyafoods.com/collections/cheese",
  },
  {
    slug: "follow-your-heart-mozzarella",
    brand: "Follow Your Heart",
    name: "Dairy-Free Mozzarella Style Shredded",
    categories: ["mozzarella"],
    source:
      "https://www.followyourheart.com/vegan-foods/dairy-free-cheese/shredded-cheese/",
  },
  {
    slug: "kite-hill-plain",
    brand: "Kite Hill",
    name: "Plain Cream Cheese",
    categories: ["cream-cheese"],
    source: "https://kite-hill.com/products/plain-cream-cheese",
  },
  {
    slug: "violife-cream-cheese",
    brand: "Violife",
    name: "Supreme Cream Cheese",
    categories: ["cream-cheese"],
    source:
      "https://www.violife.com/en-us/products/dairy-free-cream-cheese/just-like-cream-cheese-original",
  },
  {
    slug: "miyokos-classic-cream-cheese",
    brand: "Miyoko's Creamery",
    name: "Classic Cashew Milk Cream Cheese",
    categories: ["cream-cheese"],
    source: "https://www.miyokos.com/collections/plant-milk-cream-cheese",
  },
  {
    slug: "just-egg",
    brand: "Just Food Company",
    name: "Just Egg",
    categories: ["eggs"],
    source: "https://www.ju.st/eat/eggs",
    family: "just-eggs",
    familyName: "Just Egg",
  },
  {
    slug: "just-egg-folded",
    brand: "Just Food Company",
    name: "Just Egg Folded",
    categories: ["eggs"],
    source: "https://www.ju.st/eat/eggs",
    family: "just-eggs",
  },
  {
    slug: "bobs-egg-replacer",
    brand: "Bob's Red Mill",
    name: "Gluten Free Egg Replacer",
    categories: ["eggs"],
    source:
      "https://www.bobsredmill.com/product/gluten-free-vegan-egg-replacer",
    notes: "Baking replacement; not a prepared scrambled-egg substitute.",
  },
  // Milestone 7: lines sold in several flavors. Each flavor is its own
  // product; the line ranks once, with one vote per taster.
  {
    slug: "silk-original-soymilk",
    brand: "Silk",
    name: "Original Soymilk",
    categories: ["milk"],
    source: "https://silk.com/plant-based-products/soymilk/",
    family: "silk-soymilk",
    familyName: "Soymilk",
    ratings: 12,
  },
  {
    slug: "silk-vanilla-soymilk",
    brand: "Silk",
    name: "Vanilla Soymilk",
    categories: ["milk"],
    source: "https://silk.com/plant-based-products/soymilk/",
    family: "silk-soymilk",
    flavor: "Vanilla",
    ratings: 9,
  },
  {
    slug: "kite-hill-greek-plain",
    brand: "Kite Hill",
    name: "Greek Style Plain Unsweetened Yogurt",
    categories: ["greek-yogurt"],
    source: "https://kite-hill.com/",
    family: "kite-hill-greek",
    familyName: "Greek Style Yogurt",
    ratings: 14,
  },
  {
    slug: "kite-hill-greek-vanilla",
    brand: "Kite Hill",
    name: "Greek Style Vanilla Yogurt",
    categories: ["greek-yogurt"],
    source: "https://kite-hill.com/",
    family: "kite-hill-greek",
    flavor: "Vanilla",
    ratings: 10,
  },
  {
    slug: "kite-hill-greek-strawberry",
    brand: "Kite Hill",
    name: "Greek Style Strawberry Yogurt",
    categories: ["greek-yogurt"],
    source: "https://kite-hill.com/",
    family: "kite-hill-greek",
    flavor: "Strawberry",
    ratings: 6,
  },
  {
    slug: "simulate-nuggs",
    brand: "Simulate",
    name: "Nuggs",
    categories: ["chicken-nuggets"],
    source: "https://simulate.com/",
    family: "simulate-nuggs",
    familyName: "Nuggs",
    ratings: 16,
  },
  {
    slug: "simulate-spicy-nuggs",
    brand: "Simulate",
    name: "Spicy Nuggs",
    categories: ["chicken-nuggets"],
    source: "https://simulate.com/",
    family: "simulate-nuggs",
    flavor: "Spicy",
    ratings: 8,
  },
];
