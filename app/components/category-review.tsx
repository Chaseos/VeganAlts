import { useState, type FormEvent } from "react";
import { useRevalidator } from "react-router";
import type { TaxonomyService } from "@server/taxonomy/application/taxonomy-service";
import { friendly, type CommunityAction } from "../lib/community";
import { AutomatedChecks } from "./contribution-detail";

type Detail = Awaited<ReturnType<TaxonomyService["proposalDetail"]>>;

/** Accept as a new category, add as an alias of an existing one, or reject. */
export function CategoryReview({
  detail,
  checks,
  categories,
  action,
}: {
  detail: Detail;
  checks: Parameters<typeof AutomatedChecks>[0]["checks"] | null;
  categories: { id: string; name: string; isRankable: number }[];
  action: CommunityAction;
}) {
  const revalidator = useRevalidator();
  const [decision, setDecision] = useState<"accept" | "alias" | "reject">(
    "accept",
  );
  const proposed = detail.proposed as {
    name: string;
    explanation: string;
    exampleProducts?: string[];
    aliases?: string[];
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action.run(async () => {
      await action.request(`admin/moderation/category/${detail.id}/decide`, {
        decision,
        expectedRevision: detail.revision,
        note: form.get("note"),
        ...(decision === "accept"
          ? {
              slug: form.get("slug"),
              parentId: form.get("parent") || null,
              isRankable: form.get("rankable") === "on",
            }
          : {}),
        ...(decision === "alias" ? { aliasOf: form.get("aliasOf") } : {}),
      });
      await revalidator.revalidate();
    });
  }
  return (
    <div className="review-layout">
      <article className="community-panel">
        <div className="notice">
          <strong>Status: {friendly(detail.status)}</strong>
          {detail.resolutionNote && <p>{detail.resolutionNote}</p>}
        </div>
        <h2>Proposed category: {proposed.name}</h2>
        <p>{proposed.explanation}</p>
        {!!proposed.exampleProducts?.length && (
          <p>
            <strong>Examples:</strong> {proposed.exampleProducts.join(", ")}
          </p>
        )}
        {!!proposed.aliases?.length && (
          <p>
            <strong>Other names:</strong> {proposed.aliases.join(", ")}
          </p>
        )}
        <p className="small muted">
          Check for near-duplicates and overly narrow categories. Accepting
          creates a category; aliasing keeps one category findable by both
          names.
        </p>
        {checks && <AutomatedChecks checks={checks} />}
      </article>
      <aside className="community-panel">
        <h2>Record a decision</h2>
        {detail.status === "pending" ? (
          <form className="community-form" onSubmit={submit}>
            <label htmlFor="category-decision">Decision</label>
            <select
              id="category-decision"
              value={decision}
              onChange={(e) =>
                setDecision(e.target.value as "accept" | "alias" | "reject")
              }
            >
              <option value="accept">Create this category</option>
              <option value="alias">Add as another name of a category</option>
              <option value="reject">Reject proposal</option>
            </select>
            {decision === "accept" && (
              <>
                <label htmlFor="category-slug">Slug</label>
                <input
                  id="category-slug"
                  name="slug"
                  defaultValue={detail.suggestedSlug}
                  required
                />
                <label htmlFor="category-parent">Parent</label>
                <select
                  id="category-parent"
                  name="parent"
                  defaultValue={detail.parentId ?? ""}
                >
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <label className="checkbox-label">
                  <input type="checkbox" name="rankable" defaultChecked />
                  Rankable
                </label>
              </>
            )}
            {decision === "alias" && (
              <>
                <label htmlFor="category-alias-of">Existing category</label>
                <select id="category-alias-of" name="aliasOf" required>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label htmlFor="category-note">Reason and next steps</label>
            <textarea
              id="category-note"
              name="note"
              required
              minLength={8}
              maxLength={2000}
              rows={4}
            />
            <button className="button" disabled={action.busy}>
              {action.busy ? "Saving decision…" : "Save decision"}
            </button>
          </form>
        ) : (
          <p>This proposal has already been decided.</p>
        )}
      </aside>
    </div>
  );
}
