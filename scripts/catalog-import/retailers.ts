import type { ImportStore } from "../../server/community/application/catalog-import-service";

// The stores the photo batches name (docs/IMPORTER_PLAN.md, "Stores"):
// shoppers' names, as the batches record them, with the official names as
// other names. Every database starts without retailers, so the import adds
// these to the United States through the retailer proposal path.
export const IMPORT_STORES: ImportStore[] = [
  {
    name: "Sprouts",
    aliases: ["Sprouts Farmers Market"],
    websiteUrl: "https://www.sprouts.com",
  },
  {
    name: "Publix",
    aliases: ["Publix Super Markets"],
    websiteUrl: "https://www.publix.com",
  },
  { name: "Walmart", aliases: [], websiteUrl: "https://www.walmart.com" },
  { name: "Target", aliases: [], websiteUrl: "https://www.target.com" },
  {
    name: "Trader Joe's",
    aliases: [],
    websiteUrl: "https://www.traderjoes.com",
  },
  { name: "Aldi", aliases: [], websiteUrl: "https://www.aldi.us" },
  {
    name: "Whole Foods",
    aliases: ["Whole Foods Market"],
    websiteUrl: "https://www.wholefoodsmarket.com",
  },
];
