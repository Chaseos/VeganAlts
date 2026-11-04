import { expect, it, vi } from "vitest";
import { OpenAISafetyProvider } from "../../server/moderation/infrastructure/openai-safety-provider";
import { contributedText } from "../../server/moderation/domain/safety";
import {
  protectAiAdmission,
  isContributionWrite,
} from "../../server/abuse/service";

const names = [
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
];
function output(flagged = false) {
  return {
    model: "omni-moderation-test",
    results: [
      {
        flagged,
        categories: Object.fromEntries(
          names.map((n) => [n, n === "hate" && flagged]),
        ),
        category_scores: Object.fromEntries(
          names.map((n) => [n, n === "hate" && flagged ? 0.4 : 0.001]),
        ),
        category_applied_input_types: Object.fromEntries(
          names.map((n) => [n, ["text"]]),
        ),
      },
    ],
  };
}
it("keeps the global fetch receiver when using the default Worker transport", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockImplementation(function (
    this: unknown,
  ) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    return Promise.resolve(Response.json(output()));
  });
  try {
    await expect(
      new OpenAISafetyProvider("key").moderate(
        { text: "An ordinary product opinion" },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ flagged: false });
    expect(request).toHaveBeenCalledOnce();
  } finally {
    request.mockRestore();
  }
});
const images = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    contentHash: `hash-${i}`,
    contentType: "image/webp" as const,
    bytes: new Uint8Array([i, 1, 2]),
  }));
it("sends each image privately in its own request, with the text in the first", async () => {
  const request = vi.fn(async () => Response.json(output()));
  const provider = new OpenAISafetyProvider("test-secret", request);
  const result = await provider.moderate(
    { text: "Contributed text", images: images(5) },
    new AbortController().signal,
  );
  expect(result).toMatchObject({ flagged: false });
  expect(request).toHaveBeenCalledTimes(5);
  const calls = request.mock.calls as unknown as [string, RequestInit][];
  const inputs = calls.map(([url, options]) => {
    expect(url).toBe("https://api.openai.com/v1/moderations");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer test-secret",
    });
    const body = JSON.parse(String(options.body));
    expect(body.model).toBe("omni-moderation-latest");
    return body.input as {
      type: string;
      image_url?: { url: string };
    }[];
  });
  // The provider rejects a request with more than one image.
  for (const input of inputs) {
    const parts = input.filter((p) => p.type === "image_url");
    expect(parts).toHaveLength(1);
    expect(parts[0]!.image_url!.url).toMatch(/^data:image\/webp;base64,/);
  }
  expect(inputs.filter((i) => i.some((p) => p.type === "text"))).toHaveLength(
    1,
  );
  expect(inputs[0]![0]).toEqual({ type: "text", text: "Contributed text" });
});
it("respects a built-in flag on any image without an extra score cutoff", async () => {
  let calls = 0;
  const request = vi.fn(async () => Response.json(output(++calls === 3)));
  await expect(
    new OpenAISafetyProvider("key", request).moderate(
      { text: "Contributed text", images: images(4) },
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    flagged: true,
    categories: { hate: true, violence: false },
    scores: { hate: 0.4, violence: 0.001 },
  });
});
it("fails the whole check when any image's request fails", async () => {
  let calls = 0;
  const request = vi.fn(async () =>
    ++calls === 2
      ? new Response(null, { status: 500 })
      : Response.json(output()),
  );
  await expect(
    new OpenAISafetyProvider("key", request).moderate(
      { text: "Contributed text", images: images(3) },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "provider_error" });
});
it("fails closed for missing keys, incomplete responses and provider failures, retaining Retry-After", async () => {
  const request = vi.fn(async () => Response.json(output()));
  await expect(
    new OpenAISafetyProvider(undefined, request).moderate(
      { text: "Hello" },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "not_configured" });
  expect(request).not.toHaveBeenCalled();
  const incomplete = output();
  delete incomplete.results[0]!.categories.hate;
  await expect(
    new OpenAISafetyProvider("key", async () =>
      Response.json(incomplete),
    ).moderate({ text: "Hello" }, new AbortController().signal),
  ).rejects.toMatchObject({ code: "invalid_response" });
  const limited = vi.fn(
    async () =>
      new Response(null, { status: 429, headers: { "Retry-After": "7200" } }),
  );
  await expect(
    new OpenAISafetyProvider("key", limited).moderate(
      { text: "Hello" },
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: "rate_limited", retryAfterMs: 7_200_000 });
  expect(limited).toHaveBeenCalledOnce();
});
it("extracts contributed nested names and notes without including entity references", () => {
  expect(
    contributedText({
      name: "Burger",
      lineName: "Grill",
      flavor: "Spicy",
      newFood: { name: "Brats", aliases: ["Links"] },
      evidence: { note: "Package label", imageIds: ["private-image-id"] },
      productId: "product-reference",
      expectedRevision: 3,
    }),
  ).toBe("Burger\nGrill\nSpicy\nBrats\nLinks\nPackage label");
});
it("denies shared AI admission by either IP or account before any provider work", async () => {
  const pass = { limit: vi.fn(async () => ({ success: true })) },
    deny = { limit: vi.fn(async () => ({ success: false })) };
  const request = new Request("https://example.com/api/v1/comments", {
    method: "POST",
    headers: { "CF-Connecting-IP": "192.0.2.8" },
  });
  await expect(
    protectAiAdmission(
      request,
      { AI_IP_RATE_LIMIT: deny, AI_ACCOUNT_RATE_LIMIT: pass },
      "user",
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(pass.limit).not.toHaveBeenCalled();
  await expect(
    protectAiAdmission(
      request,
      { AI_IP_RATE_LIMIT: pass, AI_ACCOUNT_RATE_LIMIT: deny },
      "user",
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(pass.limit).toHaveBeenCalledWith({ key: "ip:192.0.2.8" });
  expect(deny.limit).toHaveBeenCalledWith({ key: "user:user" });
  expect(isContributionWrite(request)).toBe(true);
  expect(
    isContributionWrite(
      new Request("https://example.com/account", { method: "POST" }),
    ),
  ).toBe(true);
  expect(
    isContributionWrite(new Request("https://example.com/us/products/burger")),
  ).toBe(false);
});
