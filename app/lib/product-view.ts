const seenKey = (productId: string) => `va-viewed:${productId}`;

// Public pages are cached, so views are counted from the browser. That also
// covers in-app navigation and leaves out crawlers that don't run scripts.
// Each tab counts a product once: reloading or coming back adds nothing.
export function recordProductView(productId: string) {
  try {
    if (sessionStorage.getItem(seenKey(productId))) return;
    sessionStorage.setItem(seenKey(productId), "1");
  } catch {
    // Blocked storage only means this tab may count a product more than once.
  }
  void fetch(`/api/v1/products/${encodeURIComponent(productId)}/views`, {
    method: "POST",
    keepalive: true,
  }).catch(() => {});
}
