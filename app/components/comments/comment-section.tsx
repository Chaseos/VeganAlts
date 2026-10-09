import { useEffect, useState, type FormEvent } from "react";
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

export interface CommentPage {
  productId: string;
  sort: "best" | "newest";
  formula: "current" | "earlier";
  comments: PublicComment[];
  nextCursor: string | null;
  counts: { current: number; earlier: number };
}

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
  const action = useCommunityAction();
  const [page, setPage] = useState(initial),
    [votes, setVotes] = useState<Record<string, number>>({}),
    [own, setOwn] = useState<OwnComment[]>([]),
    [status, setStatus] = useState(""),
    [loading, setLoading] = useState(false);
  const productId = initial.productId;
  useEffect(() => {
    if (!user) {
      setVotes({});
      setOwn([]);
      return;
    }
    const controller = new AbortController();
    void fetch(
      `/api/v1/me/comment-state?productId=${encodeURIComponent(productId)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(
        (r) =>
          (r.ok ? r.json() : null) as Promise<{
            data: { votes: Record<string, number>; own: OwnComment[] };
          } | null>,
      )
      .then((value) => {
        if (!value || controller.signal.aborted) return;
        setVotes(value.data.votes);
        setOwn(value.data.own);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [user?.handle, productId]);

  async function load(
    view: Pick<CommentPage, "sort" | "formula">,
    cursor?: string,
  ) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        ...view,
        ...(cursor ? { cursor } : {}),
      });
      const response = await fetch(
        `/api/v1/products/${productSlug}/comments?${params}`,
      );
      if (!response.ok) throw new Error();
      const { data } = (await response.json()) as { data: CommentPage };
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
      setStatus("Comments could not load. Please retry.");
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
      setStatus(
        "Thanks. Your comment will appear after a moderator checks it.",
      );
      return;
    }
    setStatus("Your comment is posted.");
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
                ? { ...c, body: saved.body, editedAt: saved.editedAt }
                : c,
            ),
    }));
    setStatus(
      saved.state === "pending"
        ? "Your edit will appear after a moderator checks it."
        : "Your comment is updated.",
    );
    return true;
  }
  async function remove(id: string) {
    if (!window.confirm("Delete your comment? This can't be undone.")) return;
    const done = await action.run(() =>
      action.request(`comments/${id}/delete`, {}, crypto.randomUUID()),
    );
    if (!done) return;
    setOwn((old) => old.filter((o) => o.id !== id));
    setPage((old) => ({
      ...old,
      comments: old.comments.filter((c) => c.id !== id),
    }));
    setStatus("Your comment is deleted.");
  }
  const held = own.filter(
    (o) => o.state === "pending" && !page.comments.some((c) => c.id === o.id),
  );
  return (
    <section className="comments" aria-labelledby="comments-title">
      <div className="section-heading">
        <h2 id="comments-title">Experiences and tips</h2>
      </div>
      <p className="small muted">
        Share how it compares: taste, texture, cooking and how recently you had
        the original. Vote on whether a comment helps someone understand the
        product, not whether you agree with it.
      </p>
      <CommunityControls>
        <div className="comment-toolbar">
          <div role="group" aria-label="Sort comments">
            {(["best", "newest"] as const).map((sort) => (
              <button
                type="button"
                key={sort}
                aria-pressed={page.sort === sort}
                disabled={loading}
                onClick={() => void load({ sort, formula: page.formula })}
              >
                {sort === "best" ? "Best" : "Newest"}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Formula">
            <button
              type="button"
              aria-pressed={page.formula === "current"}
              disabled={loading}
              onClick={() => void load({ sort: page.sort, formula: "current" })}
            >
              Current formula ({page.counts.current})
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
                Earlier formulas ({page.counts.earlier})
              </button>
            )}
          </div>
        </div>
        <p role="status" className="small">
          {status}
        </p>
        {held.length > 0 && (
          <ul
            className="comment-list held"
            aria-label="Your comments awaiting review"
          >
            {held.map((o) => (
              <li className="comment" key={o.id} id={`held-${o.id}`}>
                <p className="small muted">Awaiting moderator review</p>
                <p className="comment-body">{o.body}</p>
              </li>
            ))}
          </ul>
        )}
        {page.comments.length ? (
          <ul className="comment-list" aria-label="Comments">
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
              />
            ))}
          </ul>
        ) : (
          <p className="muted">
            {page.formula === "current"
              ? "No comments on this formula yet."
              : "No comments on earlier formulas."}
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
            {loading ? "Loading…" : "Show more comments"}
          </button>
        )}
        {user ? (
          <form className="community-form comment-composer" onSubmit={post}>
            <label htmlFor="comment-body">Add your experience</label>
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
                  Compared with (optional)
                </label>
                <select id="comment-category" name="categoryId" defaultValue="">
                  <option value="">Any use</option>
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
              {action.busy ? "Posting…" : "Post comment"}
            </button>
            <GuidelinesNote />
          </form>
        ) : (
          <p>
            <a
              href={`/sign-in?returnTo=${encodeURIComponent(`/us/products/${productSlug}#comments-title`)}`}
            >
              Sign in to comment and vote
            </a>
          </p>
        )}
        <CommunityFeedback action={action} siteKey={siteKey ?? ""} />
      </CommunityControls>
    </section>
  );
}
