import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_APPLY,
  autoAcceptance,
  autoApplyPolicy,
  confidence,
  riskTier,
} from "../../server/community/domain/confidence";
import { describeChange } from "../../server/community/domain/change-summary";
import {
  changeInput,
  responseInput,
  type ProductChange,
} from "../../server/community/domain/contracts";
import type { ProductSnapshot } from "../../server/community/domain/moderation";

const evidence = { urls: [], imageIds: [], note: "Package photo evidence." };
const change = (fields: Record<string, unknown>) =>
  changeInput.parse({
    productId: "p",
    expectedRevision: 1,
    evidence,
    ...fields,
  }) as ProductChange;
const snapshot = (countedRatings = 0, manufacturerUrl: string | null = null) =>
  ({ countedRatings, manufacturerUrl }) as ProductSnapshot;
const policy = DEFAULT_AUTO_APPLY;

describe("risk tiers", () => {
  it("follow the moderation tiers and adaptive protection", () => {
    expect(
      riskTier(change({ kind: "alias", alias: "Mince" }), snapshot(), policy),
    ).toBe(1);
    expect(
      riskTier(
        change({ kind: "source_url", url: "https://brand.example/p" }),
        snapshot(),
        policy,
      ),
    ).toBe(1);
    expect(
      riskTier(
        change({ kind: "source_url", url: "https://brand.example/p" }),
        snapshot(0, "https://old.example"),
        policy,
      ),
    ).toBe(2);
    expect(
      riskTier(
        change({ kind: "rename", name: "New name" }),
        snapshot(),
        policy,
      ),
    ).toBe(2);
    expect(riskTier(change({ kind: "discontinue" }), snapshot(), policy)).toBe(
      2,
    );
    expect(
      riskTier(change({ kind: "discontinue" }), snapshot(25), policy),
    ).toBe(3);
    expect(
      riskTier(
        change({
          kind: "reformulation",
          versionLabel: "2027",
          veganStatus: "appears_vegan",
          manufacturerLabel: "vegan",
        }),
        snapshot(),
        policy,
      ),
    ).toBe(3);
    expect(
      riskTier(change({ kind: "packaging" }), snapshot(), policy, ["front"]),
    ).toBe(2);
    expect(
      riskTier(change({ kind: "packaging" }), snapshot(), policy, [
        "front",
        "ingredients",
      ]),
    ).toBe(3);
    expect(
      riskTier(
        change({
          kind: "relationships",
          productFamilyId: null,
          categoryEligibility: [{ categoryId: "c", eligible: false }],
        }),
        snapshot(),
        policy,
      ),
    ).toBe(3);
  });
});

describe("automatic acceptance", () => {
  const base = {
    tier: 2 as const,
    change: change({ kind: "rename", name: "New name" }),
    confirms: 1,
    disagrees: 0,
    established: false,
    ageMs: 25 * 3_600_000,
    decision: "READY",
  };
  it("requires an automated READY, confirmations, no disagreement and age", () => {
    expect(autoAcceptance(base, policy)).toEqual({
      eligible: true,
      reason: "confirmed",
    });
    expect(autoAcceptance({ ...base, decision: null }, policy).reason).toBe(
      "automated_check",
    );
    expect(
      autoAcceptance({ ...base, decision: "NEEDS_REVIEW" }, policy).eligible,
    ).toBe(false);
    expect(
      autoAcceptance({ ...base, disagrees: 1, confirms: 5 }, policy).reason,
    ).toBe("disagreement");
    expect(autoAcceptance({ ...base, confirms: 0 }, policy).reason).toBe(
      "confirmations",
    );
    expect(autoAcceptance({ ...base, ageMs: 1000 }, policy).reason).toBe("age");
    expect(autoAcceptance({ ...base, established: true }, policy).reason).toBe(
      "confirmations",
    );
    expect(
      autoAcceptance({ ...base, established: true, confirms: 3 }, policy)
        .eligible,
    ).toBe(true);
  });
  it("applies tier 1 immediately but never tier 3 or retailer status", () => {
    expect(
      autoAcceptance(
        {
          ...base,
          tier: 1,
          confirms: 0,
          ageMs: 0,
          change: change({ kind: "alias", alias: "Mince" }),
        },
        policy,
      ),
    ).toEqual({ eligible: true, reason: "tier_one" });
    expect(
      autoAcceptance({ ...base, tier: 3, confirms: 10 }, policy).reason,
    ).toBe("protected");
    expect(
      autoAcceptance(
        {
          ...base,
          change: change({
            kind: "retailer_status",
            retailerId: "r",
            status: "not_current",
          }),
          confirms: 10,
        },
        policy,
      ).reason,
    ).toBe("protected");
  });
  it("derives confidence from independent support", () => {
    expect(confidence(0, 0)).toBe(0);
    expect(confidence(4, 0)).toBeGreaterThan(confidence(1, 0));
    expect(confidence(4, 2)).toBeLessThan(confidence(4, 0));
  });
  it("validates configuration and responses", () => {
    expect(autoApplyPolicy('{"minAgeHours":0}').minAgeHours).toBe(0);
    expect(() => autoApplyPolicy('{"confirmations":0}')).toThrow();
    expect(responseInput.safeParse({ stance: "confirm" }).success).toBe(true);
    expect(responseInput.safeParse({ stance: "disagree" }).success).toBe(false);
    expect(
      responseInput.safeParse({
        stance: "disagree",
        note: "The package says otherwise.",
      }).success,
    ).toBe(true);
  });
  it("summarizes changes in plain language", () => {
    expect(
      describeChange(change({ kind: "rename", name: "Garden Crumbles" })),
    ).toBe("Rename to “Garden Crumbles”");
    expect(
      describeChange(change({ kind: "category_add", categoryId: "c1" }), {
        c1: "Ground Beef",
      }),
    ).toBe("Also replaces Ground Beef");
  });
});
