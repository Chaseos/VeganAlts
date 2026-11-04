import { reversalChanges } from "@server/community/domain/catalog-diff";
import type { CatalogPatch } from "@server/community/domain/moderation";
import { friendly } from "../lib/community";

function Value({
  value,
  labels,
}: {
  value: unknown;
  labels: Record<string, string>;
}) {
  if (value === undefined) return <>Not recorded</>;
  if (value === null) return <>None</>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value !== "object")
    return <>{labels[String(value)] ?? String(value)}</>;
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((item, index) => (
          <li key={index}>
            <Value value={item} labels={labels} />
          </li>
        ))}
      </ul>
    ) : (
      <>None</>
    );
  return (
    <dl>
      {Object.entries(value).map(([key, item]) => (
        <div key={key}>
          <dt>
            {friendly(
              key.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`),
            )}
          </dt>
          <dd>
            <Value value={item} labels={labels} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function CatalogReversalPreview({
  before,
  after,
  labels,
}: {
  before: CatalogPatch;
  after: CatalogPatch;
  labels: Record<string, string>;
}) {
  return (
    <section aria-label="Changes to restore">
      <h4>Changes to restore</h4>
      <p>
        These are the values recorded by the selected decision. Later
        conflicting changes must be resolved before reversal. Ratings and
        formula history are preserved.
      </p>
      {reversalChanges(before, after).map((change) => (
        <div className="notice" key={change.field}>
          <h5>{change.label}</h5>
          <p>
            <strong>After the decision</strong>
          </p>
          <Value value={change.recorded} labels={labels} />
          <p>
            <strong>Restore</strong>
          </p>
          <Value value={change.restore} labels={labels} />
        </div>
      ))}
      {before.removedCategories?.length ? (
        <p>
          Food memberships with ratings stay in history without ranking
          eligibility. Unrated memberships added by this decision are removed.
        </p>
      ) : null}
      {after.newLine && (
        <p>
          The newly created line stays in the catalog; reversing the move does
          not delete it.
        </p>
      )}
    </section>
  );
}
