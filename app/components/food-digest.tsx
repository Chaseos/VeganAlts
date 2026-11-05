import { useState, type FormEvent } from "react";
import { Link, useRevalidator } from "react-router";
import type { TaxonomyService } from "@server/taxonomy/application/taxonomy-service";
import { dateLabel, type CommunityAction } from "../lib/community";

type Row = Awaited<ReturnType<TaxonomyService["digest"]>>[number];

const STATUS: Record<string, string> = {
  accepted: "Accepted",
  aliased: "Added as another name",
  rejected: "Rejected",
  pending: "In the queue",
};

/** The last week's automatic food decisions, in English, each undoable. */
export function FoodDigest({
  rows,
  action,
}: {
  rows: Row[];
  action: CommunityAction;
}) {
  if (!rows.length)
    return <p className="small muted">No food decisions in the last week.</p>;
  return (
    <>
      {rows.map((row) => (
        <DigestRow key={row.id} row={row} action={action} />
      ))}
    </>
  );
}

function DigestRow({ row, action }: { row: Row; action: CommunityAction }) {
  const revalidator = useRevalidator();
  const [open, setOpen] = useState(false);
  const canUndo = row.status === "accepted" || row.status === "aliased";
  async function undo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const note = new FormData(event.currentTarget).get("note");
    await action.run(async () => {
      await action.request(`admin/moderation/category/${row.id}/undo`, {
        note,
      });
      await revalidator.revalidate();
    });
  }
  return (
    <article className="community-panel">
      <p>
        <strong>{row.name}</strong>
        {row.review?.text && ` · ${row.review.text.englishName}`}
        {row.country && ` · ${row.country}`}
      </p>
      {row.review?.text && <p className="small">{row.review.text.gloss}</p>}
      <p className="small muted">
        {STATUS[row.status] ?? row.status}
        {row.foodName && ` · ${row.foodName}`}
        {row.note?.includes("timed_default") && " · after the 72-hour deadline"}
        {` · ${dateLabel(row.resolvedAt ?? row.createdAt)}`}
      </p>
      {row.status === "pending" && (
        <Link className="va-link" to={`/admin/moderation/category/${row.id}`}>
          Decide
        </Link>
      )}
      {row.status === "accepted" && row.hasProducts ? (
        <p className="small">
          This food has products.{" "}
          <Link className="va-link" to="/admin/taxonomy">
            Merge it in Taxonomy
          </Link>{" "}
          to undo it.
        </p>
      ) : (
        canUndo &&
        (open ? (
          <form className="community-form" onSubmit={undo}>
            <label htmlFor={`undo-${row.id}`}>Why undo this?</label>
            <input
              id={`undo-${row.id}`}
              name="note"
              required
              minLength={8}
              maxLength={2000}
            />
            <button className="button small-button" disabled={action.busy}>
              Undo decision
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="button small-button"
            onClick={() => setOpen(true)}
          >
            Undo
          </button>
        ))
      )}
    </article>
  );
}
