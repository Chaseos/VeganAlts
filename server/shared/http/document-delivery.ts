export function deliverDocument(
  response: Response,
  nonce: string,
  analyticsToken: string,
) {
  const templateNonce = response.headers.get("X-Template-Nonce");
  const result = new Response(response.body, response);
  result.headers.delete("X-Template-Nonce");
  result.headers.delete("Cloudflare-CDN-Cache-Control");
  result.headers.delete("Cache-Tag");
  if (!result.headers.get("Content-Type")?.startsWith("text/html"))
    return result;
  result.headers.delete("ETag");
  result.headers.delete("Content-Length");
  const rewriter = new HTMLRewriter();
  if (templateNonce)
    rewriter.on("[nonce]", {
      element(element) {
        if (element.getAttribute("nonce") === templateNonce)
          element.setAttribute("nonce", nonce);
      },
    });
  if (/^[a-f0-9]{32}$/.test(analyticsToken))
    rewriter.on("body", {
      element(element) {
        element.append(
          `<script nonce="${nonce}" type="module" src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${analyticsToken}","spa":false}'></script>`,
          { html: true },
        );
      },
    });
  return rewriter.transform(result);
}
