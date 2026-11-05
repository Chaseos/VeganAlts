import { env } from "cloudflare:workers";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { authenticatedFixture } from "./auth-fixture";
import { communityApi } from "../../server/community/http/handlers";
import { communityServices } from "../../server/community/infrastructure/composition";
import { commentServices } from "../../server/comments/infrastructure/composition";
import { reportInput } from "../../server/community/domain/contracts";

const id = () => crypto.randomUUID();
const note = "Reviewed against the VeganAlts catalog criteria.";

async function setup() {
  const f = await catalogFixture(env.DB, 2);
  const auth = await authenticatedFixture();
  const app = { ...auth.authEnv, ADMIN_USER_IDS: auth.user.id };
  const community = communityServices(app);
  const comments = commentServices(app);
  const author = { ...f.users[0]!, administrator: false };
  const saved = await comments.create(author, id(), {
    productId: f.productId,
    body: "Browns well in the pan and has a firm texture.",
  });
  async function post(
    path: string,
    body: unknown,
    options: {
      key?: string;
      admin?: boolean;
      origin?: string;
      anonymous?: boolean;
    } = {},
  ) {
    const headers = new Headers(auth.headers);
    headers.set("Idempotency-Key", options.key ?? id());
    if (options.origin) headers.set("Origin", options.origin);
    if (options.anonymous) headers.delete("Cookie");
    return communityApi(
      new Request(`${app.APP_URL}/api/v1/${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      path,
      options.admin === false ? auth.authEnv : app,
    );
  }
  async function result(path: string, body: unknown, key?: string) {
    const response = await post(path, body, { key });
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Cache-Control")).toContain("no-store");
    return (
      (await response!.json()) as {
        data: { actionId: string; productId: string; id: string };
      }
    ).data;
  }
  const revision = async () =>
    (await community.repository.snapshot(f.productId)).revision;
  async function reverse(actionId: string) {
    return result(`admin/moderation/actions/${actionId}/reverse`, {
      expectedRevision: await revision(),
      note: "Restored after reviewing the original decision.",
    });
  }
  return {
    f,
    app,
    auth,
    community,
    comments,
    author,
    saved,
    post,
    result,
    revision,
    reverse,
  };
}

it("limits the scope report reason to products and records it without changing public eligibility", async () => {
  const s = await setup();
  const input = {
    targetType: "product",
    targetId: s.f.productId,
    reason: "out_of_scope",
    note,
  };
  const report = await s.result("reports", input);
  expect(await s.community.repository.report(report.id)).toMatchObject({
    target_type: "product",
    reason_code: "out_of_scope",
    status: "open",
  });
  expect(
    (await s.community.repository.snapshot(s.f.productId)).lifecycleStatus,
  ).toBe("active");
  for (const targetType of ["comment", "product_image"])
    expect(reportInput.safeParse({ ...input, targetType }).success).toBe(false);
});

it("protects direct product and comment moderation at the authenticated HTTP boundary", async () => {
  const s = await setup();
  const actions = [
    {
      path: `admin/moderation/products/${s.f.productId}/remove`,
      body: { expectedRevision: await s.revision(), note },
    },
    {
      path: `admin/moderation/comments/${s.saved.id}/hide`,
      body: { expectedUpdatedAt: s.saved.updatedAt, note },
    },
  ];
  for (const { path, body } of actions) {
    await expect(s.post(path, body, { admin: false })).rejects.toMatchObject({
      status: 403,
    });
    await expect(s.post(path, body, { anonymous: true })).rejects.toMatchObject(
      { status: 401 },
    );
    await expect(
      s.post(path, body, { origin: "https://other.example" }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(s.post(path, { ...body, note: "" })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
  }
  expect(
    (await s.community.repository.snapshot(s.f.productId)).lifecycleStatus,
  ).toBe("active");
  expect(
    (await s.community.repository.comment(s.saved.id))!.moderation_state,
  ).toBe("visible");
});

it("removes a product once through the admin API, preserves its records and restores it by reversal", async () => {
  const s = await setup();
  const before = await s.community.repository.snapshot(s.f.productId);
  const path = `admin/moderation/products/${s.f.productId}/remove`;
  const body = { expectedRevision: before.revision, note };
  await expect(
    s.post(path, { ...body, expectedRevision: before.revision + 1 }),
  ).rejects.toMatchObject({ code: "STALE_PRODUCT" });
  const key = id(),
    removed = await s.result(path, body, key);
  expect(await s.result(path, body, key)).toEqual(removed);
  expect(
    (await s.community.repository.snapshot(s.f.productId)).lifecycleStatus,
  ).toBe("hidden");
  expect((await s.community.repository.snapshot(s.f.productId)).versionId).toBe(
    before.versionId,
  );
  expect((await s.community.repository.comment(s.saved.id))!.body).toBe(
    s.saved.body,
  );
  await expect(
    s.comments.page(s.f.countryId, s.f.productId, "newest", "current", null),
  ).rejects.toMatchObject({ status: 404 });
  expect(
    (await s.community.repository.actions(s.f.productId)).filter(
      (a) => a.kind === "catalog_review",
    ),
  ).toHaveLength(1);
  await s.reverse(removed.actionId);
  expect(
    (await s.community.repository.snapshot(s.f.productId)).lifecycleStatus,
  ).toBe(before.lifecycleStatus);
  expect(
    (
      await s.comments.page(
        s.f.countryId,
        s.f.productId,
        "newest",
        "current",
        null,
      )
    ).comments,
  ).toHaveLength(1);
  // Replaying a completed request after reversal must not remove it again.
  expect(await s.result(path, body, key)).toEqual(removed);
  expect(
    (await s.community.repository.snapshot(s.f.productId)).lifecycleStatus,
  ).toBe("active");
});

it("resolves scope reports with reversible removal and rejects removal from unrelated reports", async () => {
  const s = await setup();
  for (const reason of ["wrong_category", "out_of_scope"]) {
    const report = await s.result("reports", {
      targetType: "product",
      targetId: s.f.productId,
      reason,
      note,
    });
    const detail = (await s.community.repository.report(report.id))!;
    const path = `admin/moderation/report/${report.id}/decide`;
    const decision = {
      decision: "resolve",
      expectedRevision: detail.revision,
      expectedProductRevision: await s.revision(),
      effect: "remove_product",
      note,
    };
    if (reason === "wrong_category") {
      await expect(s.post(path, decision)).rejects.toMatchObject({
        code: "INVALID_DECISION",
      });
      expect((await s.community.repository.report(report.id))!.status).toBe(
        "open",
      );
      continue;
    }
    await expect(
      s.post(path, {
        ...decision,
        expectedProductRevision: decision.expectedProductRevision + 1,
      }),
    ).rejects.toMatchObject({ code: "STALE_PRODUCT" });
    const removed = await s.result(path, decision);
    expect((await s.community.repository.report(report.id))!.status).toBe(
      "resolved",
    );
    expect(
      (await s.community.repository.snapshot(s.f.productId)).lifecycleStatus,
    ).toBe("hidden");
    await s.reverse(removed.actionId);
    expect(
      (await s.community.repository.snapshot(s.f.productId)).lifecycleStatus,
    ).toBe("active");
  }
});

it("directly hides a visible comment with a stale-edit fence, audit, retry and reversal, without a report", async () => {
  const s = await setup();
  const edited = await s.comments.edit(s.author, s.saved.id, {
    expectedUpdatedAt: s.saved.updatedAt,
    body: "Browns well and stays firm after five minutes.",
  });
  const path = `admin/moderation/comments/${s.saved.id}/hide`;
  await expect(
    s.post(path, { expectedUpdatedAt: s.saved.updatedAt, note }),
  ).rejects.toMatchObject({ code: "STALE_DECISION" });
  const page = await s.comments.page(
    s.f.countryId,
    s.f.productId,
    "newest",
    "current",
    null,
  );
  expect(page.comments[0]!.updatedAt).toBe(edited.updatedAt);
  await s.comments.vote(
    { ...s.f.users[1]!, administrator: false },
    s.saved.id,
    1,
  );
  const body = { expectedUpdatedAt: edited.updatedAt, note },
    key = id();
  const hidden = await s.result(path, body, key);
  expect(await s.result(path, body, key)).toEqual(hidden);
  expect(
    (
      await s.comments.page(
        s.f.countryId,
        s.f.productId,
        "newest",
        "current",
        null,
      )
    ).counts.current,
  ).toBe(0);
  expect(
    await env.DB.prepare(
      "SELECT body,moderation_state,up_count FROM comments WHERE id=?",
    )
      .bind(s.saved.id)
      .first(),
  ).toMatchObject({
    body: edited.body,
    moderation_state: "hidden",
    up_count: 1,
  });
  expect(
    await env.DB.prepare("SELECT id FROM reports WHERE target_id=?")
      .bind(s.saved.id)
      .first(),
  ).toBeNull();
  expect(
    (await s.community.repository.actions(s.f.productId)).filter(
      (a) => a.kind === "comment_hide",
    ),
  ).toHaveLength(1);
  expect(
    await env.DB.prepare("SELECT action FROM audit_log WHERE id=?")
      .bind(hidden.actionId)
      .first("action"),
  ).toBe("comment_hide");
  await expect(s.post(path, body)).rejects.toMatchObject({
    code: "STALE_DECISION",
  });
  await s.reverse(hidden.actionId);
  const restored = await s.comments.page(
    s.f.countryId,
    s.f.productId,
    "newest",
    "current",
    null,
  );
  expect(restored.comments[0]).toMatchObject({ body: edited.body, upvotes: 1 });
  expect(restored.counts.current).toBe(1);
  expect(await s.result(path, body, key)).toEqual(hidden);
  expect(
    (await s.community.repository.comment(s.saved.id))!.moderation_state,
  ).toBe("visible");
});

it("does not hide deleted comments or comments belonging to removed products", async () => {
  const s = await setup();
  await s.result(`admin/moderation/products/${s.f.productId}/remove`, {
    expectedRevision: await s.revision(),
    note,
  });
  const path = `admin/moderation/comments/${s.saved.id}/hide`;
  const body = { expectedUpdatedAt: s.saved.updatedAt, note };
  await expect(s.post(path, body)).rejects.toMatchObject({ status: 404 });
  await env.DB.prepare("UPDATE comments SET deleted_at=1 WHERE id=?")
    .bind(s.saved.id)
    .run();
  await expect(s.post(path, body)).rejects.toMatchObject({ status: 404 });
  expect(
    (await s.community.repository.actions(s.f.productId)).some(
      (a) => a.kind === "comment_hide",
    ),
  ).toBe(false);
});
