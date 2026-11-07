import { useState, type FormEvent } from "react";
import { Link, useRevalidator } from "react-router";
import type { TaxonomyService } from "@server/taxonomy/application/taxonomy-service";
import { dateLabel, friendly, type CommunityAction } from "../lib/community";

type Row = Awaited<ReturnType<TaxonomyService["digest"]>>[number];
type ReportRow = Awaited<ReturnType<TaxonomyService["foodReports"]>>[number];
type TranslationRow = Awaited<
  ReturnType<TaxonomyService["translationReports"]>
>[number];
type AisleRow = Awaited<
  ReturnType<TaxonomyService["aisleSuggestions"]>
>[number];

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

/** What people flagged about a food. New foods come first. */
export function FoodReports({
  rows,
  action,
}: {
  rows: ReportRow[];
  action: CommunityAction;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <h2>Food reports</h2>
      {rows.map((row) => (
        <FoodReport key={row.id} row={row} action={action} />
      ))}
    </section>
  );
}

function FoodReport({
  row,
  action,
}: {
  row: ReportRow;
  action: CommunityAction;
}) {
  return (
    <article className="community-panel">
      <p>
        <strong>{row.food}</strong>
        {` · ${row.country} · ${friendly(row.reason)}`}
        {(row.provisionalUntil ?? 0) > Date.now() && " · New food"}
      </p>
      {row.note && <p className="small">{row.note}</p>}
      <p className="small">
        <Link className="va-link" to="/admin/taxonomy">
          Change it in Taxonomy
        </Link>
      </p>
      <ReportDecision
        id={row.id}
        path={`admin/moderation/food-report/${row.id}/resolve`}
        action={action}
      />
    </article>
  );
}

/** Wording people flagged. Each stays open until an operator closes it. */
export function TranslationReports({
  rows,
  action,
}: {
  rows: TranslationRow[];
  action: CommunityAction;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <h2>Translation reports</h2>
      {rows.map((row) => (
        <article className="community-panel" key={row.id}>
          <p>
            <strong lang={row.language}>{row.text}</strong>
            {` · ${row.language}-${row.country}`}
          </p>
          {row.note && <p className="small">{row.note}</p>}
          <p className="small">
            <Link className="va-link" to={row.page}>
              {row.page}
            </Link>
          </p>
          <ReportDecision
            id={row.id}
            path={`admin/moderation/translation-report/${row.id}/resolve`}
            action={action}
          />
        </article>
      ))}
    </section>
  );
}

function ReportDecision({
  id,
  path,
  action,
}: {
  id: string;
  path: string;
  action: CommunityAction;
}) {
  const revalidator = useRevalidator();
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      await action.request(path, {
        status: submitter?.getAttribute("value") ?? "dismissed",
        note: form.get("note"),
      });
      await revalidator.revalidate();
    });
  }
  return (
    <form className="community-form" onSubmit={decide}>
      <label htmlFor={`report-note-${id}`}>What did you do?</label>
      <input
        id={`report-note-${id}`}
        name="note"
        required
        minLength={8}
        maxLength={2000}
      />
      <div className="button-row">
        <button
          className="button small-button"
          name="status"
          value="resolved"
          disabled={action.busy}
        >
          Mark handled
        </button>
        <button
          className="button secondary small-button"
          name="status"
          value="dismissed"
          disabled={action.busy}
        >
          Dismiss
        </button>
      </div>
    </form>
  );
}

/** Aisles people asked for. Foods sit in the closest aisle meanwhile. */
export function AisleSuggestions({
  rows,
  action,
}: {
  rows: AisleRow[];
  action: CommunityAction;
}) {
  if (!rows.length) return null;
  return (
    <section>
      <h2>Aisle suggestions</h2>
      {rows.map((row) => (
        <AisleSuggestion key={row.id} row={row} action={action} />
      ))}
    </section>
  );
}

function AisleSuggestion({
  row,
  action,
}: {
  row: AisleRow;
  action: CommunityAction;
}) {
  const revalidator = useRevalidator();
  async function decide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(event.currentTarget);
    const decision = submitter?.getAttribute("value") ?? "close";
    await action.run(async () => {
      await action.request(`admin/moderation/aisle/${row.id}/decide`, {
        decision,
        note: form.get("note"),
        ...(decision === "open" ? { name: form.get("name") } : {}),
      });
      await revalidator.revalidate();
    });
  }
  return (
    <article className="community-panel">
      <p>
        <strong>{row.name}</strong>
        {row.englishName && ` · ${row.englishName}`}
        {` · ${row.country}`}
      </p>
      <p className="small muted">
        {row.status === "queued" ? "Needs a decision" : "Gathering demand"}
        {` · ${row.people} ${row.people === 1 ? "person" : "people"}`}
        {row.note && ` · ${row.note}`}
      </p>
      {row.foods && <p className="small">Foods: {row.foods}</p>}
      <form className="community-form" onSubmit={decide}>
        <label htmlFor={`aisle-name-${row.id}`}>English name</label>
        <input
          id={`aisle-name-${row.id}`}
          name="name"
          required
          minLength={2}
          maxLength={160}
          defaultValue={row.englishName ?? row.name}
        />
        <label htmlFor={`aisle-note-${row.id}`}>Why?</label>
        <input
          id={`aisle-note-${row.id}`}
          name="note"
          required
          minLength={8}
          maxLength={2000}
        />
        <div className="button-row">
          <button
            className="button small-button"
            name="decision"
            value="open"
            disabled={action.busy}
          >
            Open aisle
          </button>
          <button
            className="button secondary small-button"
            name="decision"
            value="close"
            disabled={action.busy}
          >
            Close suggestion
          </button>
        </div>
      </form>
    </article>
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
