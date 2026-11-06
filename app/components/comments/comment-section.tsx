import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { PublicComment } from "@server/comments/infrastructure/d1-comment-repository";
import type { SavedComment } from "@server/comments/application/comment-service";
import { usePersonalState } from "../personal-state";
import {
  CommunityFeedback,
  CommunityControls,
  GuidelinesNote,
} from "../community-form";
import { useCommunityAction } from "../../lib/community";
import { CommentItem, type OwnComment } from "./comment-item";
import { productPath, useCountryCode } from "../../lib/site-chrome";
import { t } from "../../i18n";

export interface CommentPage {
  productId: string;
  sort: "best" | "newest";
  formula: "current" | "earlier";
  comments: PublicComment[];
  nextCursor: string | null;
  counts: { current: number; earlier: number };
}

const RECENT_OWN_MS = 20 * 60 * 1000;

/**
 * The first Best page arrives with the shared product document. Sorting and
 * pagination read the cookie-free comments API; the viewer's own votes and
 * held comments load privately after hydration.
 */
export function CommentSection({
  productSlug,
  categories,
  initial,
}: {
  productSlug: string;
  categories: { id: string; name: string }[];
  initial: CommentPage;
}) {
  const { user, siteKey } = usePersonalState();
  const country = useCountryCode();
  const action = useCommunityAction();
  const [page, setPage] = useState(initial),
    [votes, setVotes] = useState<Record<string, number>>({}),
    [own, setOwn] = useState<OwnComment[]>([]),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(false);
  const [hiddenComment, setHiddenComment] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const productId = initial.productId;
  // The viewer's votes and own comments for the comments on screen, merged
  // as further pages load so older comments keep their controls.
  async function loadPersonal(ids: string[], signal?: AbortSignal) {
    const params = new URLSearchParams({ productId });
    if (ids.length) params.set("ids", ids.slice(0, 100).join(","));
    const response = await fetch(`/api/v1/me/comment-state?${params}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok || signal?.aborted) return;
    const { data } = (await response.json()) as {
      data: { votes: Record<string, number>; own: OwnComment[] };
    };
    if (signal?.aborted) return;
    setVotes((old) => ({ ...old, ...data.votes }));
    setOwn((old) =>
      [
        ...old.filter((o) => !data.own.some((n) => n.id === o.id)),
        ...data.own,
      ].sort((a, b) => b.createdAt - a.createdAt),
    );
  }
  useEffect(() => {
    setVotes({});
    setOwn([]);
    if (!user) return;
    const controller = new AbortController();
    loadPersonal(
      page.comments.map((c) => c.id),
      controller.signal,
    ).catch(() => {});
    return () => controller.abort();
  }, [user?.handle, productId]);

  async function load(
    view: Pick<CommentPage, "sort" | "formula">,
    cursor?: string,
  ) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        country,
        ...view,
        ...(cursor ? { cursor } : {}),
      });
      const response = await fetch(
        `/api/v1/products/${productSlug}/comments?${params}`,
      );
      if (!response.ok) throw new Error();
      const { data } = (await response.json()) as { data: CommentPage };
      if (user)
        void loadPersonal(data.comments.map((c) => c.id)).catch(() => {});
      setPage((old) =>
        cursor
          ? {
              ...data,
              comments: [
                ...old.comments,
                ...data.comments.filter(
                  (c) => !old.comments.some((o) => o.id === c.id),
                ),
              ],
            }
          : data,
      );
    } catch {
      setStatus(t("comments.loadFailed"));
    } finally {
      setLoading(false);
    }
  }
  async function post(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget,
      form = new FormData(formElement);
    const category = String(form.get("categoryId") ?? "");
    const saved = await action.run(() =>
      action.request<SavedComment>("comments", {
        productId,
        body: String(form.get("body") ?? ""),
        ...(category ? { categoryId: category } : {}),
      }),
    );
    if (!saved) return;
    formElement.reset();
    setOwn((old) => [
      { ...saved, state: saved.state },
      ...old.filter((o) => o.id !== saved.id),
    ]);
    if (saved.state === "pending") {
      setStatus(t("comments.thanksPending"));
      return;
    }
    setStatus(t("comments.posted"));
    if (page.formula === "current")
      await load({ sort: "newest", formula: "current" });
  }
  async function vote(comment: PublicComment, value: -1 | 0 | 1) {
    // Each click is a distinct request; repeating a value must not replay an
    // earlier result.
    const result = await action.run(() =>
      action.request<{ vote: number; upvotes: number; downvotes: number }>(
        `comments/${comment.id}/vote`,
        { value },
        crypto.randomUUID(),
      ),
    );
    if (!result) return;
    setVotes((old) => ({ ...old, [comment.id]: result.vote }));
    setPage((old) => ({
      ...old,
      comments: old.comments.map((c) =>
        c.id === comment.id
          ? { ...c, upvotes: result.upvotes, downvotes: result.downvotes }
          : c,
      ),
    }));
  }
  async function edit(comment: PublicComment, body: string) {
    const mine = own.find((o) => o.id === comment.id);
    if (!mine) return false;
    const saved = await action.run(() =>
      action.request<SavedComment>(`comments/${comment.id}/edit`, {
        body,
        expectedUpdatedAt: mine.updatedAt,
      }),
    );
    if (!saved) return false;
    setOwn((old) =>
      old.map((o) => (o.id === saved.id ? { ...o, ...saved } : o)),
    );
    setPage((old) => ({
      ...old,
      comments:
        saved.state === "pending"
          ? old.comments.filter((c) => c.id !== saved.id)
          : old.comments.map((c) =>
              c.id === saved.id
                ? {
                    ...c,
                    body: saved.body,
                    editedAt: saved.editedAt,
                    updatedAt: saved.updatedAt,
                  }
                : c,
            ),
    }));
    setStatus(
      saved.state === "pending"
        ? t("comments.editPending")
        : t("comments.updated"),
    );
    return true;
  }
  async function remove(id: string) {
    if (!window.confirm(t("comments.confirmDelete"))) return;
    const done = await action.run(() =>
      action.request(`comments/${id}/delete`, {}, crypto.randomUUID()),
    );
    if (!done) return;
    setOwn((old) => old.filter((o) => o.id !== id));
    setPage((old) => ({
      ...old,
      comments: old.comments.filter((c) => c.id !== id),
    }));
    setStatus(t("comments.deleted"));
  }
  const held = own.filter(
    (o) => o.state === "pending" && !page.comments.some((c) => c.id === o.id),
  );
  async function hide(comment: PublicComment, note: string) {
    const saved = await action.run(() =>
      action.request(`admin/moderation/comments/${comment.id}/hide`, {
        expectedUpdatedAt: comment.updatedAt,
        note,
      }),
    );
    if (!saved) return false;
    setPage((old) => {
      const formula = comment.formula.isCurrent ? "current" : "earlier";
      return {
        ...old,
        comments: old.comments.filter((c) => c.id !== comment.id),
        counts: {
          ...old.counts,
          [formula]: Math.max(0, old.counts[formula] - 1),
        },
      };
    });
    setOwn((old) =>
      old.map((o) => (o.id === comment.id ? { ...o, state: "hidden" } : o)),
    );
    setStatus(t("comments.hidden"));
    setHiddenComment(true);
    statusRef.current?.focus();
    return true;
  }
  // Shared product HTML can lag a new comment by its 15-minute TTL plus
  // revalidation, so authors see their just-published comments meanwhile.
  const recent = own.filter(
    (o) =>
      o.state === "visible" &&
      Date.now() - o.createdAt < RECENT_OWN_MS &&
      !page.comments.some((c) => c.id === o.id),
  );
  return (
    <section className="comments" aria-labelledby="comments-title">
      <div className="section-heading">
        <h2 id="comments-title">{t("comments.title")}</h2>
      </div>
      <p className="small muted">{t("comments.intro")}</p>
      <CommunityControls>
        <div className="comment-toolbar">
          <div role="group" aria-label={t("comments.sortLabel")}>
            {(["best", "newest"] as const).map((sort) => (
              <button
                type="button"
                key={sort}
                aria-pressed={page.sort === sort}
                disabled={loading}
                onClick={() => void load({ sort, formula: page.formula })}
              >
                {sort === "best" ? t("comments.best") : t("comments.newest")}
              </button>
            ))}
          </div>
          <div role="group" aria-label={t("comments.formulaLabel")}>
            <button
              type="button"
              aria-pressed={page.formula === "current"}
              disabled={loading}
              onClick={() => void load({ sort: page.sort, formula: "current" })}
            >
              {t("comments.currentFormula", { total: page.counts.current })}
            </button>
            {page.counts.earlier > 0 && (
              <button
                type="button"
                aria-pressed={page.formula === "earlier"}
                disabled={loading}
                onClick={() =>
                  void load({ sort: page.sort, formula: "earlier" })
                }
              >
                {t("comments.earlierFormulas", {
                  total: page.counts.earlier,
                })}
              </button>
            )}
          </div>
        </div>
        <p role="status" className="small" ref={statusRef} tabIndex={-1}>
          {status}
          {hiddenComment && user?.administrator && (
            <>
              {" "}
              <Link to={`/admin/moderation/products/${productId}`}>
                {t("comments.reviewHistory")}
              </Link>
              .
            </>
          )}
        </p>
        {held.length > 0 && (
          <ul
            className="comment-list held"
            aria-label={t("comments.awaitingLabel")}
          >
            {held.map((o) => (
              <li className="comment" key={o.id} id={`held-${o.id}`}>
                <p className="small muted">{t("comments.awaiting")}</p>
                <p className="comment-body">{o.body}</p>
              </li>
            ))}
          </ul>
        )}
        {recent.length > 0 && (
          <ul
            className="comment-list held"
            aria-label={t("comments.recentLabel")}
          >
            {recent.map((o) => (
              <li className="comment" key={o.id}>
                <p className="small muted">{t("comments.published")}</p>
                <p className="comment-body">{o.body}</p>
              </li>
            ))}
          </ul>
        )}
        {page.comments.length ? (
          <ul className="comment-list" aria-label={t("comments.listLabel")}>
            {page.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                vote={votes[comment.id] ?? 0}
                own={own.find((o) => o.id === comment.id)}
                signedIn={Boolean(user)}
                action={action}
                onVote={(value) => void vote(comment, value)}
                onEdit={(body) => edit(comment, body)}
                onDelete={() => void remove(comment.id)}
                onHide={
                  user?.administrator
                    ? (note) => hide(comment, note)
                    : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <p className="muted">
            {page.formula === "current"
              ? t("comments.noneCurrent")
              : t("comments.noneEarlier")}
          </p>
        )}
        {page.nextCursor && (
          <button
            type="button"
            className="button secondary"
            disabled={loading}
            onClick={() =>
              void load(
                { sort: page.sort, formula: page.formula },
                page.nextCursor!,
              )
            }
          >
            {loading ? t("comments.loading") : t("comments.more")}
          </button>
        )}
        {user ? (
          <form className="community-form comment-composer" onSubmit={post}>
            <label htmlFor="comment-body">{t("comments.add")}</label>
            <textarea
              id="comment-body"
              name="body"
              minLength={2}
              maxLength={2000}
              required
              rows={4}
            />
            {categories.length > 1 && (
              <>
                <label htmlFor="comment-category">
                  {t("comments.comparedWith")}
                </label>
                <select id="comment-category" name="categoryId" defaultValue="">
                  <option value="">{t("comments.anyUse")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button
              className="button"
              disabled={action.busy || (action.challenge && !action.hasToken)}
            >
              {action.busy ? t("comments.posting") : t("comments.post")}
            </button>
            <GuidelinesNote />
          </form>
        ) : (
          <p>
            <a
              href={`/sign-in?returnTo=${encodeURIComponent(`${productPath(country, productSlug)}#comments-title`)}`}
            >
              {t("comments.signIn")}
            </a>
          </p>
        )}
        <CommunityFeedback action={action} siteKey={siteKey ?? ""} />
      </CommunityControls>
    </section>
  );
}
