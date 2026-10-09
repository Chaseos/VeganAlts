import { describe, expect, it } from "vitest";
import { wilsonInterval } from "../../server/shared/domain/statistics";
import {
  DEFAULT_COMMENT_POLICY,
  applyVote,
  bestRank,
  commentInput,
  decodeCommentCursor,
  encodeCommentCursor,
  isCollapsed,
  normalizeBody,
} from "../../server/comments/domain/comments";
import {
  normalizedPublicRequest,
  publicCacheTags,
  publicRoute,
} from "../../server/shared/http/public-cache";

describe("Wilson interval", () => {
  it("is confidence-aware rather than a raw ratio", () => {
    expect(wilsonInterval(0, 0)).toEqual({ lower: 0, upper: 1 });
    const one = wilsonInterval(1, 1),
      many = wilsonInterval(90, 100);
    expect(one.lower).toBeLessThan(many.lower);
    expect(many.lower).toBeGreaterThan(0.8);
    expect(wilsonInterval(0, 6).upper).toBeLessThan(0.4);
    expect(wilsonInterval(0, 5).upper).toBeGreaterThan(0.4);
  });
  it("ranks a well-supported comment above a lucky single vote", () => {
    expect(bestRank(6, 1)).toBeGreaterThan(bestRank(1, 0));
    expect(bestRank(1, 0)).toBeGreaterThan(bestRank(0, 0));
    expect(bestRank(0, 6)).toBe(0);
  });
});

describe("comment policy", () => {
  it("collapses only strongly and confidently downvoted comments", () => {
    expect(isCollapsed(0, 6, DEFAULT_COMMENT_POLICY)).toBe(true);
    expect(isCollapsed(0, 4, DEFAULT_COMMENT_POLICY)).toBe(false);
    expect(isCollapsed(3, 6, DEFAULT_COMMENT_POLICY)).toBe(false);
  });
  it("applies a changed or removed vote exactly once", () => {
    expect(applyVote({ up: 3, down: 1 }, null, 1)).toEqual({ up: 4, down: 1 });
    expect(applyVote({ up: 3, down: 1 }, 1, -1)).toEqual({ up: 2, down: 2 });
    expect(applyVote({ up: 3, down: 1 }, -1, 0)).toEqual({ up: 3, down: 0 });
  });
  it("normalizes plain text and enforces length", () => {
    expect(normalizeBody(" a  \r\nb\n\n\n\nc ")).toBe("a\nb\n\nc");
    expect(
      commentInput.safeParse({ productId: "p1", body: " x " }).success,
    ).toBe(false);
    expect(
      commentInput.safeParse({ productId: "p1", body: "y".repeat(2001) })
        .success,
    ).toBe(false);
    expect(
      commentInput.safeParse({ productId: "p1", body: "<b>ok</b>" }).data?.body,
    ).toBe("<b>ok</b>");
  });
  it("uses opaque sort-specific cursors", () => {
    const best = encodeCommentCursor({
      sort: "best",
      rank: 5,
      createdAt: 9,
      id: "c1",
    });
    expect(decodeCommentCursor(best, "best")).toEqual({
      sort: "best",
      rank: 5,
      createdAt: 9,
      id: "c1",
    });
    expect(() => decodeCommentCursor(best, "newest")).toThrow();
    expect(() => decodeCommentCursor("garbage", "best")).toThrow();
  });
});

const url0 = (request: Request) =>
  new URL(
    normalizedPublicRequest(request, "https://staging.veganalts.com", "v1").url,
  );

describe("comment cache identity", () => {
  it("caches comment pages briefly under the product's purge tag", () => {
    const origin = "https://staging.veganalts.com";
    const request = new Request(
      `${origin}/API/V1/products/beyond-beef/comments/?sort=newest&formula=current&cursor=abc&utm=x`,
    );
    const route = publicRoute(new URL(request.url))!;
    expect(route).toMatchObject({
      kind: "comments",
      ttl: 60,
      slug: "beyond-beef",
    });
    // Product slugs are unique per country; the API defaults to the United States.
    expect(publicCacheTags(route)).toContain("product:us:beyond-beef");
    expect(url0(request).searchParams.get("country")).toBe("us");
    const url = new URL(normalizedPublicRequest(request, origin, "v1").url);
    expect(url.pathname).toBe("/api/v1/products/beyond-beef/comments");
    expect(url.searchParams.get("sort")).toBe("newest");
    expect(url.searchParams.get("cursor")).toBe("abc");
    expect(url.searchParams.has("utm")).toBe(false);
    expect(
      publicRoute(new URL(`${origin}/us/products/beyond-beef/comments.data`)),
    ).toBeNull();
  });
});
