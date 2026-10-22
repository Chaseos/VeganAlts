import { afterEach, expect, it, vi } from "vitest";
import { communityRequest } from "../../app/lib/community";

afterEach(() => vi.unstubAllGlobals());
it("normalizes failed connections, malformed responses, expired sessions and rate limits", async () => {
  for (const [response, message] of [
    [Promise.reject(new TypeError("Failed to fetch")), /connection/],
    [
      Promise.resolve(
        new Response("<html>Bad gateway</html>", { status: 502 }),
      ),
      /retry/,
    ],
    [
      Promise.resolve(Response.json({ code: "NO_SESSION" }, { status: 401 })),
      /session has expired/,
    ],
    [Promise.resolve(Response.json({}, { status: 429 })), /Wait a minute/],
    [Promise.resolve(Response.json("malformed")), /retry/],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => response),
    );
    await expect(
      communityRequest("submissions/preflight", { name: "Draft" }, "same-key"),
    ).rejects.toThrow(message);
  }
});
it("preserves the supplied idempotency key across retry and propagates cancellation", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValueOnce(Response.json({ data: { receiptId: "receipt" } }));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    communityRequest("submissions/preflight", {}, "same-key"),
  ).rejects.toThrow();
  expect(
    await communityRequest("submissions/preflight", {}, "same-key"),
  ).toEqual({ receiptId: "receipt" });
  for (const call of fetcher.mock.calls)
    expect((call[1].headers as Headers).get("Idempotency-Key")).toBe(
      "same-key",
    );
  const controller = new AbortController();
  controller.abort();
  const abort = new DOMException("Aborted", "AbortError");
  fetcher.mockRejectedValueOnce(abort);
  await expect(
    communityRequest("community/brands", undefined, undefined, undefined, {
      signal: controller.signal,
    }),
  ).rejects.toBe(abort);
});
