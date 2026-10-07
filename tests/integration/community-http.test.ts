import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { authenticatedFixture } from "./auth-fixture";
import { communityApi } from "../../server/community/http/handlers";
import { verifyChallenge } from "../../server/abuse/service";

it("enforces authentication, operator allowlist, origin, validation and private cache policy at community HTTP entry points", async () => {
  const actor = await authenticatedFixture();
  const request = (path: string, body?: unknown, headers = actor.headers) => {
    const h = new Headers(headers);
    h.set("Idempotency-Key", crypto.randomUUID());
    return new Request(`${actor.authEnv.APP_URL}/api/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  const anonymous = new Headers(actor.headers);
  anonymous.delete("Cookie");
  await expect(
    communityApi(
      request("community/options", undefined, anonymous),
      "community/options",
      actor.authEnv,
    ),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    communityApi(
      request("admin/moderation/inbox"),
      "admin/moderation/inbox",
      actor.authEnv,
    ),
  ).rejects.toMatchObject({ status: 403 });
  const options = await communityApi(
    request("community/options"),
    "community/options",
    actor.authEnv,
  );
  expect(options?.headers.get("Cache-Control")).toBe("private, no-store");
  const cross = new Headers(actor.headers);
  cross.set("Origin", "https://other.example");
  await expect(
    communityApi(request("reports", {}, cross), "reports", actor.authEnv),
  ).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  await expect(
    communityApi(
      request("reports", {
        targetType: "comment",
        targetId: "missing",
        reason: "ingredient_concern",
      }),
      "reports",
      actor.authEnv,
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    communityApi(
      request("reports", {
        targetType: "product",
        targetId: "missing",
        reason: "other",
        evidenceUrls: ["bad"],
      }),
      "reports",
      actor.authEnv,
    ),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  await expect(
    communityApi(
      request("reports", { note: "a".repeat(33 * 1024) }),
      "reports",
      actor.authEnv,
    ),
  ).rejects.toMatchObject({ status: 413 });
  actor.authEnv.RATING_RISK_LIMIT = { limit: async () => ({ success: false }) };
  await expect(
    communityApi(
      request("submissions/preflight", {}),
      "submissions/preflight",
      actor.authEnv,
    ),
  ).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM submission_receipts WHERE user_id=?",
    )
      .bind(actor.user.id)
      .first("n"),
  ).toBe(0);
  const failed: typeof fetch = async () => Response.json({ success: false });
  await expect(
    verifyChallenge(
      "rejected",
      "community",
      request("submissions/preflight", {}),
      {
        APP_URL: actor.authEnv.APP_URL,
        TURNSTILE_SITE_KEY: "test",
        TURNSTILE_SECRET_KEY: "test",
      },
      failed,
    ),
  ).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
});
