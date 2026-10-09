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

describe("detail answers and last ate", () => {
  const rows = async (table: string, version: string) =>
    (
      await env.DB.prepare(
        `SELECT * FROM ${table} WHERE product_version_id = ? ORDER BY 1,2,3,4`,
      )
        .bind(version)
        .all<Record<string, unknown>>()
    ).results.map(({ recomputed_at: _, ...row }) => row);
  const questions = async (category: string) => {
    const ids = {
      taste: `taste-${category}`,
      texture: `texture-${category}`,
      melt: `melt-${category}`,
    };
    await env.DB.batch(
      (
        [
          ["taste", "Taste", 1],
          ["texture", "Texture", 1],
          ["melt", "Melt", 0],
        ] as const
      ).map(([key, label, active], index) =>
        env.DB.prepare(
          "INSERT INTO category_rating_dimensions (id,category_id,key,label,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,1)",
        ).bind(ids[key], category, key, label, index, active),
      ),
    );
    return ids;
  };

  it("stores details, keeps derived counts in step and never touches Top", async () => {
    const f = await catalogFixture(env.DB);
    const category = f.categories[0]!;
    const ids = await questions(category);
    const [a, b, c] = f.users as [
      (typeof f.users)[0],
      (typeof f.users)[0],
      (typeof f.users)[0],
    ];
    const saved = await service.rate(a, f.versionId, category, 4, {
      dimensions: { taste: 5, texture: 3 },
      conventionalRecency: "within_month",
    });
    expect(saved.rating).toMatchObject({
      dimensions: { taste: 5, texture: 3 },
      conventionalRecency: "within_month",
    });
    await service.rate(b, f.versionId, category, 3, {
      dimensions: { taste: 4 },
      conventionalRecency: "over_year",
    });
    await service.rate(c, f.versionId, category, 5);
    expect(await rows("product_category_dimension_stats", f.versionId)).toEqual(
      [
        {
          product_version_id: f.versionId,
          category_id: category,
          dimension_id: ids.taste,
          answer_count: 2,
          answer_sum: 9,
        },
        {
          product_version_id: f.versionId,
          category_id: category,
          dimension_id: ids.texture,
          answer_count: 1,
          answer_sum: 3,
        },
      ].sort((x, y) => x.dimension_id.localeCompare(y.dimension_id)),
    );
    const familiarity = async () =>
      Object.fromEntries(
        (await rows("product_category_familiarity_stats", f.versionId)).map(
          (row) => [
            `${row.recency}:${row.overall_similarity}`,
            row.rating_count,
          ],
        ),
      );
    expect(await familiarity()).toEqual({
      "within_month:4": 1,
      "over_year:3": 1,
      "unanswered:5": 1,
    });

    // Details alone never move Top; absent fields stay, null clears.
    const top = await stats(f.versionId);
    const changed = await service.rate(a, f.versionId, category, 4, {
      dimensions: { texture: null },
    });
    expect(changed.outcome).toBe("updated");
    expect(changed.rating).toMatchObject({
      dimensions: { taste: 5 },
      conventionalRecency: "within_month",
    });
    expect(
      (
        await service.rate(a, f.versionId, category, 4, {
          dimensions: { taste: 5, texture: null },
          conventionalRecency: "within_month",
        })
      ).outcome,
    ).toBe("unchanged");
    expect(
      (await stats(f.versionId)).map(({ recomputed_at: _, ...row }) => row),
    ).toEqual(top.map(({ recomputed_at: _, ...row }) => row));
    expect(
      (await rows("product_category_dimension_stats", f.versionId)).map(
        (row) => row.dimension_id,
      ),
    ).toEqual([ids.taste]);

    await expect(
      service.rate(a, f.versionId, category, 4, { dimensions: { smell: 3 } }),
    ).rejects.toMatchObject({ code: "INVALID_DIMENSION", status: 422 });
    await expect(
      service.rate(a, f.versionId, category, 4, { dimensions: { melt: 3 } }),
    ).rejects.toMatchObject({ code: "STALE_DIMENSIONS", status: 409 });

    // Only counted ratings count; deleting a rating deletes its answers.
    const snapshot = await repository.snapshot(f.versionId);
    await service.setCounted(
      f.versionId,
      snapshot!.ratings.find((r) => r.userId === b.id)!.id,
      false,
    );
    expect(await familiarity()).toEqual({
      "within_month:4": 1,
      "unanswered:5": 1,
    });
    expect(await rows("product_category_dimension_stats", f.versionId)).toEqual(
      [expect.objectContaining({ answer_count: 1, answer_sum: 5 })],
    );
    await service.remove(a, f.versionId, category);
    expect(await rows("product_category_dimension_stats", f.versionId)).toEqual(
      [],
    );
    const answers = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM rating_dimension_values v JOIN ratings r ON r.id=v.rating_id WHERE r.product_version_id=?",
    )
      .bind(f.versionId)
      .first<number>("n");
    // The uncounted rating keeps its answer.
    expect(answers).toBe(1);

    // Rebuilding derived rows from canonical ratings is exact.
    await service.rate(a, f.versionId, category, 2, {
      dimensions: { taste: 1, texture: 2 },
      conventionalRecency: "current_or_week",
    });
    const before = {
      details: await rows("product_category_dimension_stats", f.versionId),
      familiarity: await rows(
        "product_category_familiarity_stats",
        f.versionId,
      ),
    };
    await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM product_category_dimension_stats WHERE product_version_id=?",
      ).bind(f.versionId),
      env.DB.prepare(
        "DELETE FROM product_category_familiarity_stats WHERE product_version_id=?",
      ).bind(f.versionId),
    ]);
    await service.rebuildVersions([f.versionId]);
    expect({
      details: await rows("product_category_dimension_stats", f.versionId),
      familiarity: await rows(
        "product_category_familiarity_stats",
        f.versionId,
      ),
    }).toEqual(before);
  });

  it("keeps answers with their question when a dimension would change food", async () => {
    const f = await catalogFixture(env.DB);
    const [from, to] = f.categories as [string, string];
    await questions(from);
    await service.rate(f.users[0]!, f.versionId, from, 4, {
      dimensions: { taste: 4 },
    });
    await expect(
      env.DB.prepare(
        "UPDATE category_rating_dimensions SET key='flavor' WHERE id=?",
      )
        .bind(`taste-${from}`)
        .run(),
    ).rejects.toThrow(/keeps its key/);
    // No same-key question on the other food: the rating cannot move.
    await expect(
      env.DB.prepare(
        "UPDATE ratings SET category_id=? WHERE product_version_id=? AND category_id=?",
      )
        .bind(to, f.versionId, from)
        .run(),
    ).rejects.toThrow(/no matching dimension/);
    await questions(to);
    await env.DB.prepare(
      "UPDATE ratings SET category_id=? WHERE product_version_id=? AND category_id=?",
    )
      .bind(to, f.versionId, from)
      .run();
    expect(
      await env.DB.prepare(
        "SELECT v.dimension_id FROM rating_dimension_values v JOIN ratings r ON r.id=v.rating_id WHERE r.product_version_id=?",
      )
        .bind(f.versionId)
        .first<string>("dimension_id"),
    ).toBe(`taste-${to}`);
  });
});
