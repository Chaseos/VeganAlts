import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import type { PublicComment } from "@server/comments/infrastructure/d1-comment-repository";
import { reportReasons } from "@server/community/domain/contracts";
import { dateLabel, friendly, type CommunityAction } from "../../lib/community";
import { t } from "../../i18n";

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
  onHide,
}: {
  comment: PublicComment;
  vote: number;
  own: OwnComment | undefined;
  signedIn: boolean;
  action: CommunityAction;
  onVote: (value: -1 | 0 | 1) => void;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => void;
  onHide?: (note: string) => Promise<boolean>;
}) {
  const [revealed, setRevealed] = useState(false),
    [editing, setEditing] = useState(false),
    [reporting, setReporting] = useState(false),
    [reported, setReported] = useState(false);
  const [hiding, setHiding] = useState(false);
  const hideButton = useRef<HTMLButtonElement>(null);
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
  async function hideComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") ?? "");
    if (await onHide?.(note)) setHiding(false);
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
        {comment.editedAt && (
          <span className="muted">{t("comments.edited")}</span>
        )}
      </header>
      {hidden ? (
        <p className="comment-collapsed">
          {t("comments.collapsed")}{" "}
          <button
            type="button"
            className="link-button"
            aria-expanded="false"
            aria-controls={`comment-body-${comment.id}`}
            onClick={() => setRevealed(true)}
          >
            {t("comments.show")}
          </button>
        </p>
      ) : editing ? (
        <form className="community-form" onSubmit={saveEdit}>
          <label htmlFor={`edit-${comment.id}`}>
            {t("comments.editYours")}
          </label>
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
              {t("comments.saveChanges")}
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => setEditing(false)}
            >
              {t("comments.cancel")}
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
          aria-label={t("comments.wasUseful")}
        >
          <button
            type="button"
            aria-pressed={vote === 1}
            disabled={!signedIn || Boolean(own) || action.busy}
            onClick={() => onVote(vote === 1 ? 0 : 1)}
          >
            <span aria-hidden="true">▲</span> {t("comments.useful")}{" "}
            <span className="vote-count">{comment.upvotes}</span>
          </button>
          <button
            type="button"
            aria-pressed={vote === -1}
            disabled={!signedIn || Boolean(own) || action.busy}
            onClick={() => onVote(vote === -1 ? 0 : -1)}
          >
            <span aria-hidden="true">▼</span> {t("comments.notUseful")}{" "}
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
              {t("comments.edit")}
            </button>
            <button type="button" className="link-button" onClick={onDelete}>
              {t("comments.delete")}
            </button>
          </>
        ) : (
          signedIn &&
          (reported ? (
            <span className="small muted" role="status">
              {t("comments.reportReceived")}
            </span>
          ) : (
            <button
              type="button"
              className="link-button"
              aria-expanded={reporting}
              onClick={() => setReporting((v) => !v)}
            >
              {t("comments.report")}
            </button>
          ))
        )}
        {onHide && (
          <button
            ref={hideButton}
            type="button"
            className="link-button"
            disabled={action.busy}
            aria-expanded={hiding}
            aria-controls={`hide-comment-${comment.id}`}
            onClick={() => {
              setHiding((value) => !value);
              setReporting(false);
              setEditing(false);
            }}
          >
            {t("comments.hide")}
          </button>
        )}
      </div>
      {hiding && onHide && (
        <form
          id={`hide-comment-${comment.id}`}
          className="community-form comment-report"
          onSubmit={hideComment}
        >
          <p>{t("comments.hideExplain")}</p>
          <label htmlFor={`hide-note-${comment.id}`}>
            {t("comments.hideReason")}
          </label>
          <textarea
            id={`hide-note-${comment.id}`}
            name="note"
            rows={2}
            required
            minLength={8}
            maxLength={2000}
            autoFocus
          />
          <div className="button-row">
            <button className="button" disabled={action.busy}>
              {t("comments.confirmHide")}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={action.busy}
              onClick={() => {
                setHiding(false);
                hideButton.current?.focus();
              }}
            >
              {t("comments.cancel")}
            </button>
          </div>
        </form>
      )}
      {reporting && (
        <form className="community-form comment-report" onSubmit={saveReport}>
          <label htmlFor={`reason-${comment.id}`}>
            {t("comments.whyReport")}
          </label>
          <select id={`reason-${comment.id}`} name="reason">
            {reportReasons.comment.map((reason) => (
              <option key={reason} value={reason}>
                {friendly(reason)}
              </option>
            ))}
          </select>
          <label htmlFor={`report-note-${comment.id}`}>
            {t("comments.details")}
          </label>
          <textarea
            id={`report-note-${comment.id}`}
            name="note"
            rows={2}
            maxLength={2000}
          />
          <button className="button secondary" disabled={action.busy}>
            {t("comments.sendReport")}
          </button>
        </form>
      )}
    </li>
  );
}
