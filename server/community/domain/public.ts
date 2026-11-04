import type { Classification } from "./contracts";

export interface RetailerSummary {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string | null;
  status: string;
  contributorCount: number;
  recentContributorCount: number;
  lastConfirmedAt: number | null;
  stale: boolean;
}
export interface RelatedProduct {
  id: string;
  slug: string;
  name: string;
  country: string;
  relationship: string;
}
export interface CommunityProductDetails {
  classification: Classification | null;
  ingredientTranscription: {
    ingredients: string | null;
    contains: string | null;
    mayContain: string | null;
    onlineIngredients: string | null;
    sourceImageIds: string[];
    verification: string;
    onlineContains: string | null;
    onlineMayContain: string | null;
    onlineSource: { url: string; accessedAt: string; productMatch: string } | null;
  } | null;
  retailers: RetailerSummary[];
  relatedProducts: RelatedProduct[];
  revision: number;
  publicationState: "published";
  canonicalRedirect: null;
}
