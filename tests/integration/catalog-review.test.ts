import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { CatalogReviewService } from "../../server/community/application/catalog-review-service";
import { CatalogDecisionRepository } from "../../server/community/infrastructure/catalog-decision-repository";
import { communityServices } from "../../server/community/infrastructure/composition";
import { lineRefresh } from "../../server/ranking/infrastructure/line-refresh";
import { ratingsService } from "../../server/ratings/infrastructure/composition";
const id = () => crypto.randomUUID();

it.each(["exclude", "hold", "reclassify"] as const)(
  "audits and reverses %s while preserving formula and rating history",
  async (decision) => {
    const f = await catalogFixture(env.DB);
    const actor = { ...f.users[0]!, administrator: true };
    const { repository, moderation } = communityServices(env);
    const service = new CatalogReviewService(
      repository,
      new CatalogDecisionRepository(repository, lineRefresh(env)),
      id,
    );
    const ratings = ratingsService(env);
    await ratings.rate(f.users[1]!, f.versionId, f.categories[0]!, 4);
    const before = await repository.snapshot(f.productId),
      key = id();
    const target = id();
    await env.DB.prepare(
      "INSERT INTO categories(id,slug,name,is_rankable,created_at,updated_at) VALUES(?,?,?,1,1,1)",
    )
      .bind(target, target, "Brownies")
      .run();
    const input = {
      decision,
      expectedRevision: before.revision,
      note: "Owner-approved release review with package evidence.",
      ...(decision === "reclassify"
        ? { categoryId: target, newLineName: "Distinct recipe" }
        : {}),
    };
    const result = await service.apply(actor, key, f.productId, input);
    expect(await service.apply(actor, key, f.productId, input)).toEqual(result);
    const changed = await repository.snapshot(f.productId);
    if (decision === "exclude" || decision === "hold")
      expect(changed.lifecycleStatus).toBe("hidden");
    else
      expect(
        changed.categories.filter((c) => c.eligible).map((c) => c.categoryId),
      ).toEqual([target]);
    if (decision === "reclassify") {
      expect(changed.familyId).not.toBe(before.familyId);
      await ratings.rate(f.users[2]!, f.versionId, target, 5);
    }
    await moderation.reverse(actor, id(), result.actionId, {
      expectedRevision: (await repository.snapshot(f.productId)).revision,
      note: "Rehearsal reversal restores the previous comparison.",
    });
    const restored = await repository.snapshot(f.productId);
    expect(restored.familyId).toBe(before.familyId);
    expect(restored.lifecycleStatus).toBe(before.lifecycleStatus);
    expect(restored.categories.filter((c) => c.eligible)).toEqual(
      before.categories,
    );
    expect(restored.versionId).toBe(f.versionId);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM ratings WHERE product_version_id=?",
      )
        .bind(f.versionId)
        .first<number>("n"),
    ).toBe(decision === "reclassify" ? 2 : 1);
    await expect(
      service.apply(
        { ...actor, administrator: false },
        id(),
        f.productId,
        input,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.apply(actor, id(), f.productId, input),
    ).rejects.toMatchObject({ code: "STALE_PRODUCT" });
  },
);
