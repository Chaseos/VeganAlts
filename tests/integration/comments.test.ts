import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { authenticatedFixture } from "./auth-fixture";
import { commentServices } from "../../server/comments/infrastructure/composition";
import { CommentService } from "../../server/comments/application/comment-service";
import { D1CommentRepository } from "../../server/comments/infrastructure/d1-comment-repository";
import { DEFAULT_COMMENT_POLICY } from "../../server/comments/domain/comments";
import {
  ModerationDecisionService,
  ProviderError,
  type ModerationProvider,
} from "../../server/moderation/application/decision-service";
import { D1DecisionRepository } from "../../server/moderation/infrastructure/d1-decision-repository";
import { FakeDecisionProvider } from "../../server/moderation/infrastructure/fake-provider";
import { moderationPolicy } from "../../server/moderation/domain/policy";
import { communityServices } from "../../server/community/infrastructure/composition";
import { commentsApi } from "../../server/comments/http/handlers";

const id = () => crypto.randomUUID();
async function setup(users = 8) {
  const f = await catalogFixture(env.DB, users);
  await env.DB.prepare("UPDATE countries SET iso2=id WHERE iso2='US'").run();
  await env.DB.prepare("UPDATE countries SET iso2='US' WHERE id=?")
    .bind(f.countryId)
    .run();
  const actors = f.users.map((u) => ({ ...u, administrator: false }));
  return { f, actors };
}
const aggregateHash = async () =>
  JSON.stringify(
    (
      await env.DB.prepare(
        "SELECT product_version_id,category_id,rating_count,rating_sum,bayesian_score FROM product_category_stats ORDER BY product_version_id,category_id",
      ).all()
    ).results,
  );

it("publishes ordinary comments, rejects duplicates and serves session-free pages with private personal state", async () => {
  const { f, actors } = await setup();
  const comments = commentServices({ ...env, APP_ENV: "local" }, id);
  const saved = await comments.create(actors[0]!, id(), {
    productId: f.productId,
    body: "  Browns well and holds together in tacos.\r\n\r\n\r\nNeeds salt.  ",
    categoryId: f.categories[0],
  });
  expect(saved).toMatchObject({ state: "visible" });
  expect(saved.body).toBe(
    "Browns well and holds together in tacos.\n\nNeeds salt.",
  );
  await expect(
    comments.create(actors[0]!, id(), {
      productId: f.productId,
      body: saved.body,
    }),
  ).rejects.toMatchObject({ code: "DUPLICATE_COMMENT" });
  await expect(
    comments.create(actors[1]!, id(), {
      productId: f.productId,
      body: "Short opinion",
      categoryId: "not-a-category",
    }),
  ).rejects.toMatchObject({ code: "INVALID_CATEGORY" });
  // Same key retries return the saved comment.
  const key = id(),
    first = await comments.create(actors[1]!, key, {
      productId: f.productId,
      body: "Pretty good.",
    });
  expect(
    await comments.create(actors[1]!, key, {
      productId: f.productId,
      body: "Pretty good.",
    }),
  ).toEqual(first);
  const page = await comments.page(f.productId, "newest", "current", null);
  expect(page.comments.map((c) => c.id)).toEqual([first.id, saved.id]);
  expect(page.comments[1]).toMatchObject({
    author: { handle: f.users[0]!.id },
    category: { id: f.categories[0] },
    formula: { isCurrent: true },
    collapsed: false,
  });
  expect(page.counts).toEqual({ current: 2, earlier: 0 });
  expect(await comments.personal(actors[0]!, f.productId)).toMatchObject({
    own: [expect.objectContaining({ id: saved.id, state: "visible" })],
  });
});

it("keeps one vote per account, ranks Best by confidence and collapses heavily downvoted comments without touching rankings", async () => {
  const { f, actors } = await setup(9);
  const comments = commentServices({ ...env, APP_ENV: "local" }, id);
  const before = await aggregateHash();
  const lucky = await comments.create(actors[0]!, id(), {
    productId: f.productId,
    body: "One upvote only.",
  });
  const proven = await comments.create(actors[1]!, id(), {
    productId: f.productId,
    body: "Many people found this useful.",
  });
  const poor = await comments.create(actors[2]!, id(), {
    productId: f.productId,
    body: "Not very helpful text.",
  });
  await expect(comments.vote(actors[0]!, lucky.id, 1)).rejects.toMatchObject({
    code: "OWN_COMMENT",
  });
  await comments.vote(actors[3]!, lucky.id, 1);
  // Concurrent votes from distinct accounts all count exactly once.
  await Promise.all(
    actors.slice(2, 9).map((a) => comments.vote(a, proven.id, 1)),
  );
  await comments.vote(actors[3]!, proven.id, -1);
  // Repeating or changing a vote never inflates the count.
  await comments.vote(actors[4]!, proven.id, 1);
  await comments.vote(actors[5]!, proven.id, -1);
  await comments.vote(actors[5]!, proven.id, 1);
  await Promise.all(
    actors.slice(3, 9).map((a) => comments.vote(a, poor.id, -1)),
  );
  const rows = await env.DB.prepare(
    "SELECT id,up_count,down_count FROM comments WHERE id IN (?,?,?)",
  )
    .bind(lucky.id, proven.id, poor.id)
    .all<{ id: string; up_count: number; down_count: number }>();
  const count = (id: string) => rows.results.find((r) => r.id === id)!;
  expect(count(proven.id)).toMatchObject({ up_count: 6, down_count: 1 });
  expect(count(lucky.id)).toMatchObject({ up_count: 1, down_count: 0 });
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM comment_votes WHERE comment_id=?",
    )
      .bind(proven.id)
      .first("n"),
  ).toBe(7);
  const best = await comments.page(f.productId, "best", "current", null);
  expect(best.comments.map((c) => c.id)).toEqual([
    proven.id,
    lucky.id,
    poor.id,
  ]);
  expect(best.comments.find((c) => c.id === poor.id)?.collapsed).toBe(true);
  const newest = await comments.page(f.productId, "newest", "current", null);
  expect(newest.comments.map((c) => c.id)).toEqual([
    poor.id,
    proven.id,
    lucky.id,
  ]);
  // Removing a vote deletes it.
  await comments.vote(actors[3]!, lucky.id, 0);
  expect(
    await env.DB.prepare("SELECT up_count FROM comments WHERE id=?")
      .bind(lucky.id)
      .first("up_count"),
  ).toBe(0);
  expect(await aggregateHash()).toBe(before);
});

it("paginates with stable cursors and separates earlier formulas", async () => {
  const { f, actors } = await setup(2);
  const clock = { now: Date.now() };
  const comments = commentServices(
    { ...env, APP_ENV: "local" },
    id,
    () => clock.now++,
  );
  for (let i = 0; i < 23; i++)
    await comments.create(actors[i % 2]!, id(), {
      productId: f.productId,
      body: `Comment number ${i}`,
    });
  const first = await comments.page(f.productId, "newest", "current", null);
  expect(first.comments).toHaveLength(20);
  const second = await comments.page(
    f.productId,
    "newest",
    "current",
    first.nextCursor,
  );
  expect(second.comments).toHaveLength(3);
  expect(second.nextCursor).toBeNull();
  expect(
    new Set([...first.comments, ...second.comments].map((c) => c.id)).size,
  ).toBe(23);
  await expect(
    comments.page(f.productId, "best", "current", first.nextCursor),
  ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  // A new current formula keeps earlier comments readable and labeled.
  const next = id();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE product_versions SET is_current=0 WHERE product_id=?",
    ).bind(f.productId),
    env.DB.prepare(
      "INSERT INTO product_versions(id,product_id,version_label,is_current,created_at,updated_at) VALUES(?,?,?,1,1,1)",
    ).bind(next, f.productId, "Reformulated"),
  ]);
  expect(
    (await comments.page(f.productId, "best", "current", null)).counts,
  ).toEqual({ current: 0, earlier: 23 });
  const earlier = await comments.page(f.productId, "best", "earlier", null);
  expect(earlier.comments[0]!.formula).toMatchObject({ isCurrent: false });
});

it("holds uncertain or unevaluated comments, blocks near-certain spam and releases held comments when the provider recovers", async () => {
  const { f, actors } = await setup(3);
  const fake = new FakeDecisionProvider();
  let failing = true;
  const flaky: ModerationProvider = {
    name: "fake",
    model: (tier) => fake.model(tier),
    decide: async (request) => {
      if (failing) throw new ProviderError("rate_limited");
      return fake.decide(request);
    },
  };
  const decisions = (provider: ModerationProvider) =>
    new ModerationDecisionService(
      new D1DecisionRepository(env.DB),
      provider,
      moderationPolicy(),
      id,
    );
  const service = (provider: ModerationProvider) =>
    new CommentService(
      new D1CommentRepository(env.DB, DEFAULT_COMMENT_POLICY),
      decisions(provider),
      DEFAULT_COMMENT_POLICY,
      id,
    );
  const comments = service(fake);
  await expect(
    comments.create(actors[0]!, id(), {
      productId: f.productId,
      body: "Buy cheap followers [fake:recommended_action=REJECT_SPAM]",
    }),
  ).rejects.toMatchObject({ code: "COMMENT_BLOCKED", status: 422 });
  const held = await comments.create(actors[0]!, id(), {
    productId: f.productId,
    body: "Visit my store [fake:commercial_intent=LIKELY]",
  });
  expect(held).toMatchObject({ state: "pending" });
  expect(held.reasons[0]).toContain("moderator");
  const unevaluated = await service(flaky).create(actors[1]!, id(), {
    productId: f.productId,
    body: "Creamy and close to the original.",
  });
  expect(unevaluated.state).toBe("pending");
  expect(
    (await comments.page(f.productId, "newest", "current", null)).comments,
  ).toHaveLength(0);
  // Operators see both in the inbox; only provider failures are retried.
  const inbox = await communityServices(env).moderation.inbox(
    { ...actors[2]!, administrator: true },
    null,
  );
  expect(
    inbox.items.filter((i) => i.kind === "comment").map((i) => i.id),
  ).toEqual(expect.arrayContaining([held.id, unevaluated.id]));
  expect(await service(flaky).reevaluateHeld()).toBe(0);
  failing = false;
  expect(await service(flaky).reevaluateHeld()).toBe(1);
  const visible = (
    await comments.page(f.productId, "newest", "current", null)
  ).comments.map((c) => c.id);
  expect(visible).toEqual([unevaluated.id]);
});

it("lets authors edit and delete with fences, and operators publish, hide and reverse comments through audited actions", async () => {
  const { f, actors } = await setup(3);
  const comments = commentServices(
    { ...env, APP_ENV: "local", MODERATION_PROVIDER: "fake" },
    id,
  );
  const community = communityServices(env, id);
  const operator = { ...actors[2]!, administrator: true };
  const saved = await comments.create(actors[0]!, id(), {
    productId: f.productId,
    body: "Melts well on pizza.",
  });
  await expect(
    comments.edit(actors[1]!, saved.id, {
      body: "Hijack",
      expectedUpdatedAt: saved.updatedAt,
    }),
  ).rejects.toMatchObject({ status: 404 });
  const edited = await comments.edit(actors[0]!, saved.id, {
    body: "Melts well on pizza after five minutes.",
    expectedUpdatedAt: saved.updatedAt,
  });
  expect(edited).toMatchObject({ state: "visible" });
  await expect(
    comments.edit(actors[0]!, saved.id, {
      body: "Stale edit",
      expectedUpdatedAt: saved.updatedAt,
    }),
  ).rejects.toMatchObject({ code: "COMMENT_CHANGED" });
  // An edit can be held for review like a new comment.
  const heldEdit = await comments.edit(actors[0]!, saved.id, {
    body: "Now on sale at my shop [fake:recommended_action=HOLD]",
    expectedUpdatedAt: edited.updatedAt,
  });
  expect(heldEdit.state).toBe("pending");
  const detail = await community.moderation.detail(
    operator,
    "comment",
    saved.id,
  );
  const published = (await community.moderation.decide(
    operator,
    id(),
    "comment",
    saved.id,
    {
      decision: "accept",
      expectedRevision: detail.revision,
      note: "Reviewed: acceptable product experience.",
      effect: "none",
    },
  )) as { actionId: string };
  expect(
    await env.DB.prepare("SELECT moderation_state FROM comments WHERE id=?")
      .bind(saved.id)
      .first("moderation_state"),
  ).toBe("visible");
  // A report resolved with the hide effect is reversible.
  const report = await community.contributions.report(actors[1]!, id(), {
    targetType: "comment",
    targetId: saved.id,
    reason: "spam",
    note: "",
    evidenceUrls: [],
  });
  const reportDetail = await community.moderation.detail(
    operator,
    "report",
    report.id,
  );
  expect(reportDetail).toMatchObject({
    reportedComment: { author: f.users[0]!.id, state: "visible" },
  });
  const snapshot = await community.repository.snapshot(f.productId);
  const hidden = (await community.moderation.decide(
    operator,
    id(),
    "report",
    report.id,
    {
      decision: "resolve",
      expectedRevision: reportDetail.revision,
      note: "Promotional content hidden.",
      effect: "hide_comment",
      expectedProductRevision: snapshot.revision,
    },
  )) as { actionId: string };
  expect(
    await env.DB.prepare("SELECT moderation_state FROM comments WHERE id=?")
      .bind(saved.id)
      .first("moderation_state"),
  ).toBe("hidden");
  await expect(comments.vote(actors[1]!, saved.id, 1)).rejects.toMatchObject({
    status: 404,
  });
  await community.moderation.reverse(operator, id(), hidden.actionId, {
    expectedRevision: (await community.repository.snapshot(f.productId))
      .revision,
    note: "Reversed after review of the appeal.",
  });
  expect(
    await env.DB.prepare("SELECT moderation_state FROM comments WHERE id=?")
      .bind(saved.id)
      .first("moderation_state"),
  ).toBe("visible");
  expect(
    await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE id IN (?,?)",
    )
      .bind(published.actionId, hidden.actionId)
      .first("n"),
  ).toBe(2);
  const removed = await comments.remove(actors[0]!, saved.id);
  expect(removed).toMatchObject({ deleted: true });
  expect(
    (await comments.page(f.productId, "newest", "current", null)).comments,
  ).toHaveLength(0);
});

it("guards comment HTTP writes and keeps public pages session-free", async () => {
  const actor = await authenticatedFixture();
  const { f } = await setup(1);
  const pass = { limit: async () => ({ success: true }) };
  const authEnv = {
    ...actor.authEnv,
    COMMENT_RATE_LIMIT: pass,
    VOTE_RATE_LIMIT: pass,
  };
  const request = (path: string, body?: unknown, headers = actor.headers) => {
    const h = new Headers(headers);
    h.set("Idempotency-Key", crypto.randomUUID());
    return new Request(`${authEnv.APP_URL}/api/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  const anonymous = new Headers(actor.headers);
  anonymous.delete("Cookie");
  await expect(
    commentsApi(
      request(
        "comments",
        { productId: f.productId, body: "Hi there" },
        anonymous,
      ),
      "comments",
      authEnv,
    ),
  ).rejects.toMatchObject({ status: 401 });
  const cross = new Headers(actor.headers);
  cross.set("Origin", "https://other.example");
  await expect(
    commentsApi(
      request("comments", { productId: f.productId, body: "Hi there" }, cross),
      "comments",
      authEnv,
    ),
  ).rejects.toMatchObject({ code: "INVALID_ORIGIN" });
  const created = await commentsApi(
    request("comments", {
      productId: f.productId,
      body: "<script>alert('x')</script> Tastes great",
    }),
    "comments",
    authEnv,
  );
  expect(created?.headers.get("Cache-Control")).toBe("private, no-store");
  const body = (await created!.json()) as { data: { body: string } };
  // Stored verbatim as plain text; rendering escapes it.
  expect(body.data.body).toBe("<script>alert('x')</script> Tastes great");
  const state = await commentsApi(
    request(`me/comment-state?productId=${f.productId}`),
    "me/comment-state",
    authEnv,
  );
  expect(state?.headers.get("Cache-Control")).toBe("private, no-store");
});
