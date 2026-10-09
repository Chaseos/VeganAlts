import { hreflang } from "@server/catalog/domain/markets";
export function publicMetadata(
  title: string,
  description: string,
  path: string,
  origin: string,
  staging: boolean,
) {
  const url = new URL(path, origin).href;
  return [
    { title: `${title} · VeganAlts` },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: url },
    { property: "og:image", content: new URL("/social.png", origin).href },
    { name: "twitter:card", content: "summary_large_image" },
    ...(staging ? [{ name: "robots", content: "noindex, nofollow" }] : []),
  ];
}

/**
 * Honest structured data only: navigation breadcrumbs and ordered lists.
 * Similarity scores are not product-quality reviews, so no AggregateRating.
 */
export function breadcrumbs(
  origin: string,
  items: { name: string; path: string }[],
) {
  return {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: new URL(item.path, origin).href,
      })),
    },
  };
}
export function itemList(
  origin: string,
  name: string,
  items: { name: string; path: string }[],
  start = 1,
) {
  return {
    "script:ld+json": {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name,
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: start + index,
        name: item.name,
        url: new URL(item.path, origin).href,
      })),
    },
  };
}

/**
 * The same food in every active country, so search engines show each
 * country its own ranking. The United States page is the default.
 */
export function countryAlternates(
  origin: string,
  countries: { code: string }[],
  path: (code: string) => string,
) {
  if (countries.length < 2) return [];
  return [
    ...countries.map((country) => ({
      tagName: "link",
      rel: "alternate",
      hrefLang: hreflang(country.code),
      href: new URL(path(country.code), origin).href,
    })),
    {
      tagName: "link",
      rel: "alternate",
      hrefLang: "x-default",
      href: new URL(path("us"), origin).href,
    },
  ];
}
