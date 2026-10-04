import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { D1RatingsRepository } from "../../server/ratings/infrastructure/d1-repository";
import { RatingsService } from "../../server/ratings/application/service";
import { D1RankingReader } from "../../server/ranking/infrastructure/d1-ranking-reader";
import { INITIAL_RANKING_PARAMETERS as parameters } from "../../server/ranking/domain/policy";
import { catalogFixture } from "./fixtures";

const repository = new D1RatingsRepository(env.DB);
const service = new RatingsService(
  repository,
  parameters,
  () => crypto.randomUUID(),
  () => 1_790_000_000_000,
);
const reader = new D1RankingReader(env.DB);
const stats = async (version: string) =>
  (
    await env.DB.prepare(
      "SELECT * FROM product_category_stats WHERE product_version_id = ? ORDER BY category_id",
    )
      .bind(version)
      .all()
  ).results;

describe("canonical writes and atomic aggregates", () => {
  it("serializes concurrent creates, updates, exclusions, deletions and Tried changes", async () => {
    const f = await catalogFixture(env.DB, 10);
    const category = f.categories[0]!;
    await Promise.all(
      f.users.map((user) => service.rate(user, f.versionId, category, 3)),
    );
    let ranked = await reader.top(f.countryId, category);
    expect(ranked[0]).toMatchObject({
      ratingCount: 10,
      rawAverage: 3,
      triedCount: 10,
    });
    await Promise.all([
      service.rate(f.users[0]!, f.versionId, category, 5),
      service.remove(f.users[1]!, f.versionId, category),
      service.rate(f.users[2]!, f.versionId, f.categories[1]!, 1),
    ]);
    ranked = await reader.top(f.countryId, category);
    expect(ranked[0]).toMatchObject({ ratingCount: 9, rawAverage: 29 / 9 });
    const snapshot = await repository.snapshot(f.versionId);
    const excluded = snapshot!.ratings.find(
      (rating) => rating.userId === f.users[0]!.id,
    )!;
    await service.setCounted(f.versionId, excluded.id, false);
    // Editing an excluded rating must not silently restore its vote.
    await service.rate(f.users[0]!, f.versionId, category, 4);
    expect((await reader.top(f.countryId, category))[0]).toMatchObject({
      ratingCount: 8,
      rawAverage: 3,
    });
    await expect(
      service.setTried(f.users[0]!, f.versionId, false),
    ).rejects.toMatchObject({ code: "RATING_REQUIRES_TRIED" });
    await service.setTried(f.users[1]!, f.versionId, false);
    expect((await reader.top(f.countryId, category))[0]?.triedCount).toBe(9);
    expect((await reader.top(f.countryId, f.categories[1]!))[0]).toMatchObject({
      ratingCount: 1,
      rawAverage: 1,
      triedCount: 9,
    });
    const before = await stats(f.versionId);
    await env.DB.prepare("UPDATE profiles SET trust_level=100 WHERE user_id=?")
      .bind(f.users[0]!.id)
      .run();
    await service.rebuildPage();
    expect(await stats(f.versionId)).toEqual(before);
  });

  it("preserves historical formulas and country isolation through a transition", async () => {
    const f = await catalogFixture(env.DB);
    const category = f.categories[0]!;
    await service.rate(f.users[0]!, f.versionId, category, 5);
    const nextVersion = `next-${f.versionId}`;
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE product_versions SET is_current=0 WHERE id=?",
      ).bind(f.versionId),
      env.DB.prepare(
        "INSERT INTO product_versions (id,product_id,is_current,created_at,updated_at) VALUES (?,?,1,2,2)",
      ).bind(nextVersion, f.productId),
    ]);
    expect(await reader.top(f.countryId, category)).toEqual([]);
    await expect(
      service.rate(f.users[1]!, f.versionId, category, 1),
    ).rejects.toMatchObject({ code: "NOT_RATEABLE" });
    await service.rate(f.users[0]!, nextVersion, category, 2);
    expect((await reader.top(f.countryId, category))[0]).toMatchObject({
      versionId: nextVersion,
      rawAverage: 2,
      ratingCount: 1,
    });
    expect((await stats(f.versionId))[0]?.rating_sum).toBe(5);
    expect(await reader.top(f.otherCountryId, category)).toEqual([]);
    await env.DB.prepare(
      "UPDATE product_categories SET ranking_eligible=0 WHERE product_id=? AND category_id=?",
    )
      .bind(f.productId, category)
      .run();
    expect(await reader.top(f.countryId, category)).toEqual([]);
  });

  it("does not commit a stale snapshot or allow a partial canonical write", async () => {
    const f = await catalogFixture(env.DB);
    const stale = (await repository.snapshot(f.versionId))!;
    await service.rate(f.users[0]!, f.versionId, f.categories[0]!, 4);
    expect(
      await repository.commit(
        stale,
        {
          kind: "delete",
          userId: f.users[0]!.id,
          categoryId: f.categories[0]!,
        },
        [],
        1,
      ),
    ).toBe(false);
    expect(
      (await reader.top(f.countryId, f.categories[0]!))[0]?.ratingCount,
    ).toBe(1);
    const fresh = (await repository.snapshot(f.versionId))!;
    await expect(
      repository.commit(
        fresh,
        {
          kind: "upsert",
          rating: {
            id: "broken",
            userId: "missing",
            categoryId: f.categories[0]!,
            score: 3,
            isCounted: true,
            createdAt: 1,
            updatedAt: 1,
          },
        },
        [],
        1,
      ),
    ).rejects.toThrow(/FOREIGN KEY/);
    expect((await repository.snapshot(f.versionId))!.revision).toBe(
      fresh.revision,
    );
    expect(
      (await reader.top(f.countryId, f.categories[0]!))[0]?.ratingCount,
    ).toBe(1);
  });
});
