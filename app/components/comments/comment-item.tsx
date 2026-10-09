import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { PublicComment } from "@server/comments/infrastructure/d1-comment-repository";
import { reportReasons } from "@server/community/domain/contracts";
import { dateLabel, friendly, type CommunityAction } from "../../lib/community";

export interface OwnComment {
  id: string;
  body: string;
  state: "pending" | "visible" | "hidden" | "removed";
  updatedAt: number;
  createdAt: number;
  editedAt: number | null;
}

export function CommentItem({
  comment,
  vote,
  own,
  signedIn,
  action,
  onVote,
  onEdit,
  onDelete,
}: {
  comment: PublicComment;
  vote: number;
  own: OwnComment | undefined;
  signedIn: boolean;
  action: CommunityAction;
  onVote: (value: -1 | 0 | 1) => void;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [revealed, setRevealed] = useState(false),
    [editing, setEditing] = useState(false),
    [reporting, setReporting] = useState(false),
    [reported, setReported] = useState(false);
  const hidden = comment.collapsed && !revealed;
  async function saveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await action.run(() =>
      action.request("reports", {
        targetType: "comment",
        targetId: comment.id,
        reason: form.get("reason"),
        note: String(form.get("note") ?? ""),
        evidenceUrls: [],
      }),
    );
    if (saved) {
      setReporting(false);
      setReported(true);
    }
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = String(new FormData(event.currentTarget).get("body") ?? "");
    if (await onEdit(body)) setEditing(false);
  }
  return (
    <li className="comment" id={`comment-${comment.id}`}>
      <header className="comment-meta">
        <Link to={`/users/${comment.author.handle}`}>
          {comment.author.displayName ?? `@${comment.author.handle}`}
        </Link>
        <span>{dateLabel(comment.createdAt)}</span>
        {!comment.formula.isCurrent && (
          <span className="comment-tag">{comment.formula.label}</span>
        )}
        {comment.category && (
          <span className="comment-tag">{comment.category.name}</span>
        )}
        {comment.editedAt && <span className="muted">Edited</span>}
      </header>
      {hidden ? (
        <p className="comment-collapsed">
          Collapsed after many “not useful” votes.{" "}
          <button
            type="button"
            className="link-button"
            aria-expanded="false"
            aria-controls={`comment-body-${comment.id}`}
            onClick={() => setRevealed(true)}
          >
            Show comment
          </button>
        </p>
      ) : editing ? (
        <form className="community-form" onSubmit={saveEdit}>
          <label htmlFor={`edit-${comment.id}`}>Edit your comment</label>
          <textarea
            id={`edit-${comment.id}`}
            name="body"
            defaultValue={comment.body}
            minLength={2}
            maxLength={2000}
            required
            rows={4}
          />
          <div className="button-row">
            <button className="button" disabled={action.busy}>
              Save changes
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="comment-body" id={`comment-body-${comment.id}`}>
          {comment.body}
        </p>
      )}
      <div className="comment-actions">
        <div
          className="vote-group"
          role="group"
          aria-label="Was this comment useful?"
        >
          <button
            type="button"
            aria-pressed={vote === 1}
            disabled={!signedIn || Boolean(own) || action.busy}
            onClick={() => onVote(vote === 1 ? 0 : 1)}
          >
            <span aria-hidden="true">▲</span> Useful{" "}
            <span className="vote-count">{comment.upvotes}</span>
          </button>
          <button
            type="button"
            aria-pressed={vote === -1}
            disabled={!signedIn || Boolean(own) || action.busy}
            onClick={() => onVote(vote === -1 ? 0 : -1)}
          >
            <span aria-hidden="true">▼</span> Not useful{" "}
            <span className="vote-count">{comment.downvotes}</span>
          </button>
        </div>
        {own ? (
          <>
            <button
              type="button"
              className="link-button"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
            <button type="button" className="link-button" onClick={onDelete}>
              Delete
            </button>
          </>
        ) : (
          signedIn &&
          (reported ? (
            <span className="small muted" role="status">
              Report received
            </span>
          ) : (
            <button
              type="button"
              className="link-button"
              aria-expanded={reporting}
              onClick={() => setReporting((v) => !v)}
            >
              Report
            </button>
          ))
        )}
      </div>
      {reporting && (
        <form className="community-form comment-report" onSubmit={saveReport}>
          <label htmlFor={`reason-${comment.id}`}>Why report this?</label>
          <select id={`reason-${comment.id}`} name="reason">
            {reportReasons.comment.map((reason) => (
              <option key={reason} value={reason}>
                {friendly(reason)}
              </option>
            ))}
          </select>
          <label htmlFor={`report-note-${comment.id}`}>
            Details (optional)
          </label>
          <textarea
            id={`report-note-${comment.id}`}
            name="note"
            rows={2}
            maxLength={2000}
          />
          <button className="button secondary" disabled={action.busy}>
            Send report
          </button>
        </form>
      )}
    </li>
  );
}
