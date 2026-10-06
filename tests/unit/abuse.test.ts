import { expect, it, vi } from "vitest";
import {
  enforceLimit,
  protectContribution,
  verifyChallenge,
} from "../../server/abuse/service";

const request = new Request("https://staging.veganalts.com/api/v1/ratings", {
  headers: { "CF-Connecting-IP": "192.0.2.1" },
});
const challengeEnv = {
  APP_URL: "https://staging.veganalts.com",
  TURNSTILE_SECRET_KEY: "test-secret",
  TURNSTILE_SITE_KEY: "test-site",
};
it("verifies elevated-risk challenges on the server against both hostname and action", async () => {
  await expect(
    verifyChallenge(undefined, "rating", request, challengeEnv),
  ).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
  for (const result of [
    { success: false },
    { success: true, hostname: "elsewhere.test", action: "rating" },
    { success: true, hostname: "staging.veganalts.com", action: "sign-in" },
  ]) {
    await expect(
      verifyChallenge("token", "rating", request, challengeEnv, async () =>
        Response.json(result),
      ),
    ).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
  }
  const verify = vi.fn(async () =>
    Response.json({
      success: true,
      hostname: "staging.veganalts.com",
      action: "rating",
    }),
  );
  await verifyChallenge("token", "rating", request, challengeEnv, verify);
  expect(verify).toHaveBeenCalledOnce();
  await expect(
    verifyChallenge("token", "rating", request, challengeEnv, async () => {
      throw new Error("network");
    }),
  ).rejects.toMatchObject({ code: "CHALLENGE_UNAVAILABLE", status: 503 });
});

it("lets normal contributions pass without a challenge and applies separate hard and risk limits", async () => {
  const hard = { limit: vi.fn(async () => ({ success: true })) };
  const risk = { limit: vi.fn(async () => ({ success: true })) };
  const env = {
    ...challengeEnv,
    RATING_RATE_LIMIT: hard,
    RATING_RISK_LIMIT: risk,
    AUTH_RATE_LIMIT: hard,
    AUTH_RISK_LIMIT: risk,
  };
  await protectContribution(request, env, "rating", "user");
  expect(hard.limit.mock.calls).toEqual([
    [{ key: "ip:192.0.2.1" }],
    [{ key: "user:user" }],
  ]);
  risk.limit.mockResolvedValue({ success: false });
  await expect(
    protectContribution(request, env, "rating", "user"),
  ).rejects.toMatchObject({ code: "CHALLENGE_REQUIRED" });
  await expect(
    enforceLimit({ limit: async () => ({ success: false }) }, "key"),
  ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
});
