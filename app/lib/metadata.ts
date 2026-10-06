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
