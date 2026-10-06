import { expect, it } from "vitest";
import { deliverDocument } from "../../server/shared/http/document-delivery";
import { responsePolicy } from "../../server/shared/http/response-policy";

it("delivers fresh CSP nonces from one cached template without blessing untrusted scripts", async () => {
  const template = new Response(
    '<html><body><script nonce="template">window.safe=true</script><script nonce="untrusted">untrusted</script></body></html>',
    {
      headers: {
        "Content-Type": "text/html",
        "X-Template-Nonce": "template",
        "Cloudflare-CDN-Cache-Control": "max-age=600",
        "Cache-Tag": "product:example",
        ETag: "template",
      },
    },
  );
  for (const nonce of ["fresh-one", "fresh-two"]) {
    const result = responsePolicy(
      deliverDocument(template.clone(), nonce, "a".repeat(32)),
      new Request("https://staging.veganalts.com/us/products/example"),
      "staging",
      "request",
      nonce,
    );
    const html = await result.text();
    expect(html).toContain(`nonce="${nonce}"`);
    expect(html).toContain('nonce="untrusted"');
    expect(html).not.toContain('nonce="template"');
    expect(html).toContain("static.cloudflareinsights.com/beacon.min.js");
    expect(result.headers.get("Content-Security-Policy")).toContain(
      `'nonce-${nonce}'`,
    );
    expect(result.headers.get("Content-Security-Policy")).not.toContain(
      "'unsafe-inline'",
    );
    for (const header of [
      "X-Template-Nonce",
      "Cache-Tag",
      "Cloudflare-CDN-Cache-Control",
      "ETag",
    ])
      expect(result.headers.has(header)).toBe(false);
  }
});

it("never widens an explicitly private response even on a public URL", () => {
  const response = responsePolicy(
    new Response("private", {
      headers: { "Cache-Control": "private, no-store" },
    }),
    new Request("https://staging.veganalts.com/"),
    "staging",
    "request",
  );
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
