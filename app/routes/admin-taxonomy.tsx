import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { useRevalidator } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { taxonomyServices } from "@server/taxonomy/infrastructure/composition";
import { PageShell } from "../components/layout/page-shell";
import { Badge } from "../components/ui/badges";
import { Breadcrumb } from "../components/ui/navigation";
import {
  CommunityControls,
  CommunityFeedback,
} from "../components/community-form";
import { dateLabel, friendly, useCommunityAction } from "../lib/community";
import type { Route } from "./+types/admin-taxonomy";

export async function loader({ request }: Route.LoaderArgs) {
  const actor = await communityPageActor(request, env, true);
  return {
    siteKey: env.TURNSTILE_SITE_KEY,
    ...(await taxonomyServices(env).tree(actor)),
  };
}
export function meta() {
  return [
    { title: "Taxonomy · VeganAlts" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}
const list = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

type Category = Route.ComponentProps["loaderData"]["categories"][number];
const LEVEL = ["Root", "Aisle", "Shelf", "Food"];

// The tree in Food → aisle → shelf → food order, with retired categories last.
function ordered(categories: Category[]) {
  const children = (parentId: string | null) =>
    categories
      .filter((c) => c.parentId === parentId && c.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));
  const out: Category[] = [];
  const visit = (parentId: string | null, seen: Set<string>) => {
    for (const child of children(parentId)) {
      if (seen.has(child.id)) continue;
      out.push(child);
      visit(child.id, new Set([...seen, child.id]));
    }
  };
  visit(null, new Set());
  return [
    ...out,
    ...categories.filter((c) => c.isActive && !out.includes(c)),
    ...categories.filter((c) => !c.isActive),
  ];
}

/**
 * Operator taxonomy management. Every change records a reason, is fenced on
 * the category revision and can be reversed from the action list.
 */
export default function AdminTaxonomy({
  loaderData: data,
}: Route.ComponentProps) {
  const action = useCommunityAction(),
    revalidator = useRevalidator();
  const [editing, setEditing] = useState<string | null>(null),
    [status, setStatus] = useState(""),
    [featureCountry, setFeatureCountry] = useState("US");
  const name = (id: string | null) =>
    data.categories.find((c) => c.id === id)?.name ?? "—";
  const active = data.categories.filter((c) => c.isActive);
  const foods = active.filter((c) => c.isRankable);
  const features = data.features.filter((f) => f.country === featureCountry);
  async function send(path: string, body: unknown, done: string) {
    const result = await action.run(() => action.request(path, body));
    if (result === undefined) return;
    setStatus(done);
    setEditing(null);
    await revalidator.revalidate();
  }
  const submit =
    (handler: (form: FormData) => Promise<void>) =>
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handler(new FormData(event.currentTarget));
    };
  const outside = active.filter((c) => c.outsideDepth);
  return (
    <PageShell width="wide" aisles={false}>
      <CommunityControls>
        <Breadcrumb
          items={[
            { label: "Review inbox", to: "/admin/moderation" },
            { label: "Taxonomy" },
          ]}
        />
        <header className="page-heading section-space-sm">
          <p className="eyebrow">Operator workspace</p>
          <h1>Taxonomy</h1>
          <p>
            Food → aisle → shelf → food. Aisles and shelves organize the aisle
            bar; foods are ranked. Renamed slugs redirect; merges move ratings
            to the surviving food and can be reversed.
          </p>
        </header>
        <p role="status">{status}</p>
        <CommunityFeedback action={action} siteKey={data.siteKey} />
        {outside.length > 0 && (
          <div className="notice warn">
            <strong className="notice-title">
              {outside.length === 1
                ? "1 category is outside the three levels"
                : `${outside.length} categories are outside the three levels`}
            </strong>
            <p>
              They stay reachable by address and search but are missing from the
              aisle bar: {outside.map((c) => c.name).join(", ")}.
            </p>
          </div>
        )}

        <section
          className="va-card section-space"
          aria-labelledby="categories-heading"
        >
          <h2 id="categories-heading" className="va-heading-s">
            Aisles, shelves and foods
          </h2>
          <ul className="va-divided va-taxonomy-tree">
            {ordered(data.categories).map((c) => (
              <li
                key={c.id}
                className={`va-taxonomy-tree__row va-taxonomy-tree__row--${Math.min(c.depth ?? 0, 3)}`}
              >
                <div className="va-taxonomy-tree__summary">
                  <strong>{c.name}</strong>
                  <span className="va-chip-row">
                    <Badge tone={c.isRankable ? "good" : "neutral"}>
                      {c.isRankable ? "Food" : (LEVEL[c.depth ?? 0] ?? "Group")}
                    </Badge>
                    {c.outsideDepth && (
                      <Badge tone="warn">Outside depth three</Badge>
                    )}
                    {!c.isActive && <Badge>Retired</Badge>}
                  </span>
                  <span className="small muted">
                    /{c.slug} · in {name(c.parentId)} · {c.productCount}{" "}
                    products
                  </span>
                  {c.aliases.length > 0 && (
                    <p className="small">
                      Also:{" "}
                      {c.aliases
                        .map((a) =>
                          a.country
                            ? `${a.alias} (${a.country}${a.displayName ? ", display name" : ""})`
                            : a.alias,
                        )
                        .join(", ")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="link-button"
                  aria-expanded={editing === c.id}
                  onClick={() => setEditing(editing === c.id ? null : c.id)}
                >
                  Edit {c.name}
                </button>
                {editing === c.id && (
                  <form
                    className="community-form va-taxonomy-tree__form"
                    onSubmit={submit((form) => {
                      const rankable = form.get("rankable") === "on";
                      // Plain aliases keep their market scope; country names
                      // are each country's display name for the food.
                      const plain = rankable
                        ? list(form.get("aliases")).map((alias) => {
                            const known = c.aliases.find(
                              (a) => a.alias === alias && !a.displayName,
                            );
                            return known?.country
                              ? { alias, country: known.country }
                              : { alias };
                          })
                        : [];
                      const display = rankable
                        ? data.countries.flatMap((country) => {
                            const value = String(
                              form.get(`display-${country.iso2}`) ?? "",
                            ).trim();
                            return value
                              ? [
                                  {
                                    alias: value,
                                    country: country.iso2,
                                    displayName: true,
                                  },
                                ]
                              : [];
                          })
                        : [];
                      return send(
                        `admin/taxonomy/categories/${c.id}`,
                        {
                          expectedRevision: c.revision,
                          name: form.get("name"),
                          slug: form.get("slug"),
                          parentId: form.get("parent") || null,
                          isRankable: rankable,
                          isActive: form.get("active") === "on",
                          aliases: [...plain, ...display],
                          note: form.get("note"),
                        },
                        `${c.name} updated.`,
                      );
                    })}
                  >
                    <div className="form-field">
                      <label htmlFor={`name-${c.id}`}>Name</label>
                      <input
                        id={`name-${c.id}`}
                        name="name"
                        defaultValue={c.name}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor={`slug-${c.id}`}>Slug</label>
                      <input
                        id={`slug-${c.id}`}
                        name="slug"
                        defaultValue={c.slug}
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor={`parent-${c.id}`}>Parent</label>
                      <select
                        id={`parent-${c.id}`}
                        name="parent"
                        defaultValue={c.parentId ?? ""}
                      >
                        <option value="">None</option>
                        {active
                          .filter((p) => p.id !== c.id && !p.isRankable)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({LEVEL[p.depth ?? 0] ?? "Group"})
                            </option>
                          ))}
                      </select>
                    </div>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="rankable"
                        defaultChecked={c.isRankable === 1}
                      />
                      Ranked food (aisles and shelves are not ranked)
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={c.isActive === 1}
                      />
                      Active
                    </label>
                    <div className="form-field">
                      <label htmlFor={`aliases-${c.id}`}>
                        Aliases (comma separated, foods only)
                      </label>
                      <input
                        id={`aliases-${c.id}`}
                        name="aliases"
                        defaultValue={c.aliases
                          .filter((a) => !a.displayName)
                          .map((a) => a.alias)
                          .join(", ")}
                      />
                    </div>
                    <fieldset className="va-country-names">
                      <legend>Name in each country (optional)</legend>
                      {data.countries.map((country) => (
                        <div className="form-field" key={country.iso2}>
                          <label htmlFor={`display-${c.id}-${country.iso2}`}>
                            {country.name}
                          </label>
                          <input
                            id={`display-${c.id}-${country.iso2}`}
                            name={`display-${country.iso2}`}
                            defaultValue={
                              c.aliases.find(
                                (a) =>
                                  a.displayName && a.country === country.iso2,
                              )?.alias ?? ""
                            }
                          />
                        </div>
                      ))}
                    </fieldset>
                    <div className="form-field">
                      <label htmlFor={`note-${c.id}`}>Reason</label>
                      <textarea
                        id={`note-${c.id}`}
                        name="note"
                        required
                        minLength={8}
                        rows={2}
                      />
                    </div>
                    <button className="button" disabled={action.busy}>
                      Save category
                    </button>
                  </form>
                )}
                {editing === c.id && c.isRankable === 1 && c.isActive === 1 && (
                  <DimensionEditor
                    category={c}
                    busy={action.busy}
                    onSave={(dimensions, note) =>
                      send(
                        `admin/taxonomy/categories/${c.id}/dimensions`,
                        { expectedRevision: c.revision, dimensions, note },
                        `${c.name} questions saved.`,
                      )
                    }
                  />
                )}
              </li>
            ))}
          </ul>
        </section>

        <section
          className="va-card section-space"
          aria-labelledby="create-heading"
        >
          <h2 id="create-heading" className="va-heading-s">
            Create a food, shelf or aisle
          </h2>
          <form
            className="community-form"
            onSubmit={submit((form) =>
              send(
                "admin/taxonomy/categories",
                {
                  name: form.get("name"),
                  ...(form.get("slug") ? { slug: form.get("slug") } : {}),
                  parentId: form.get("parent") || null,
                  isRankable: form.get("rankable") === "on",
                  aliases: list(form.get("aliases")),
                  note: form.get("note"),
                },
                "Category created.",
              ),
            )}
          >
            <div className="form-field">
              <label htmlFor="new-name">Conventional food</label>
              <input id="new-name" name="name" required minLength={2} />
            </div>
            <div className="form-field">
              <label htmlFor="new-slug">Slug (optional)</label>
              <input id="new-slug" name="slug" />
            </div>
            <div className="form-field">
              <label htmlFor="new-parent">Parent</label>
              <select id="new-parent" name="parent" defaultValue="">
                <option value="">None</option>
                {active
                  .filter((p) => !p.isRankable)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({LEVEL[p.depth ?? 0] ?? "Group"})
                    </option>
                  ))}
              </select>
            </div>
            <label className="checkbox-label">
              <input type="checkbox" name="rankable" defaultChecked />
              Ranked food
            </label>
            <div className="form-field">
              <label htmlFor="new-aliases">
                Aliases (comma separated, foods only)
              </label>
              <input id="new-aliases" name="aliases" />
            </div>
            <div className="form-field">
              <label htmlFor="new-note">Reason</label>
              <textarea
                id="new-note"
                name="note"
                required
                minLength={8}
                rows={2}
              />
            </div>
            <button className="button" disabled={action.busy}>
              Create category
            </button>
          </form>
        </section>

        <section
          className="va-card section-space"
          aria-labelledby="merge-heading"
        >
          <h2 id="merge-heading" className="va-heading-s">
            Merge duplicates
          </h2>
          <p className="small muted">
            Use only when both describe the same conventional food (or the same
            aisle or shelf). Ratings move to the survivor; if someone rated a
            product in both, their most recent rating counts and the other is
            kept uncounted.
          </p>
          <form
            className="community-form"
            onSubmit={submit(async (form) => {
              const donor = active.find((c) => c.id === form.get("donor"));
              const survivor = active.find(
                (c) => c.id === form.get("survivor"),
              );
              if (!donor || !survivor) return;
              await send(
                "admin/taxonomy/merges",
                {
                  donorId: donor.id,
                  survivorId: survivor.id,
                  donorRevision: donor.revision,
                  survivorRevision: survivor.revision,
                  note: form.get("note"),
                },
                `${donor.name} merged into ${survivor.name}.`,
              );
            })}
          >
            {(["donor", "survivor"] as const).map((role) => (
              <div className="form-field" key={role}>
                <label htmlFor={`merge-${role}`}>
                  {role === "donor"
                    ? "Duplicate to retire"
                    : "Category to keep"}
                </label>
                <select
                  id={`merge-${role}`}
                  name={role}
                  required
                  defaultValue=""
                >
                  <option value="">Choose a category</option>
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.isRankable
                        ? c.name
                        : `${c.name} (${LEVEL[c.depth ?? 0] ?? "Group"})`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="form-field">
              <label htmlFor="merge-note">Reason</label>
              <textarea
                id="merge-note"
                name="note"
                required
                minLength={8}
                rows={2}
              />
            </div>
            <button className="button" disabled={action.busy}>
              Merge categories
            </button>
          </form>
          {data.merges.length > 0 && (
            <ul className="va-divided section-space-sm">
              {data.merges.map((m) => (
                <li key={m.id} className="va-taxonomy-merge">
                  <span>
                    {name(m.donorId)} → {name(m.survivorId)} ·{" "}
                    {friendly(m.state)} · {dateLabel(m.createdAt)}
                  </span>
                  {m.state === "complete" ? (
                    <form
                      className="community-form merge-reverse"
                      onSubmit={submit((form) =>
                        send(
                          `admin/taxonomy/merges/${m.id}/reverse`,
                          { note: form.get("note") },
                          "Merge reversed.",
                        ),
                      )}
                    >
                      <div className="form-field">
                        <label htmlFor={`reverse-${m.id}`}>
                          Reason to reverse
                        </label>
                        <input
                          id={`reverse-${m.id}`}
                          name="note"
                          required
                          minLength={8}
                        />
                      </div>
                      <button
                        className="button secondary"
                        disabled={action.busy}
                      >
                        Reverse merge
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={action.busy}
                      onClick={() =>
                        void send(
                          `admin/taxonomy/merges/${m.id}/continue`,
                          {},
                          "Merge continued.",
                        )
                      }
                    >
                      Continue
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="va-card section-space"
          aria-labelledby="features-heading"
        >
          <h2 id="features-heading" className="va-heading-s">
            Homepage features
          </h2>
          <p className="small muted">
            Each country’s fallback for “Start with these”, in order. Derived
            lists replace them as foods earn established #1s.
          </p>
          <div className="form-field">
            <label htmlFor="features-country">Country</label>
            <select
              id="features-country"
              value={featureCountry}
              onChange={(event) => setFeatureCountry(event.target.value)}
            >
              {data.countries.map((country) => (
                <option key={country.iso2} value={country.iso2}>
                  {country.name}
                </option>
              ))}
            </select>
          </div>
          <form
            key={featureCountry}
            className="community-form"
            onSubmit={submit((form) =>
              send(
                "admin/taxonomy/features",
                {
                  categoryIds: [0, 1, 2, 3, 4, 5]
                    .map((i) => String(form.get(`feature-${i}`) ?? ""))
                    .filter(Boolean),
                  country: featureCountry,
                  note: form.get("note"),
                },
                "Homepage features saved.",
              ),
            )}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div className="form-field" key={i}>
                <label htmlFor={`feature-${i}`}>Position {i + 1}</label>
                <select
                  id={`feature-${i}`}
                  name={`feature-${i}`}
                  defaultValue={features[i]?.categoryId ?? ""}
                >
                  <option value="">Empty</option>
                  {foods.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="form-field">
              <label htmlFor="features-note">Reason</label>
              <textarea
                id="features-note"
                name="note"
                required
                minLength={8}
                rows={2}
              />
            </div>
            <button className="button" disabled={action.busy}>
              Save features
            </button>
          </form>
        </section>

        <section
          className="va-card section-space"
          aria-labelledby="actions-heading"
        >
          <h2 id="actions-heading" className="va-heading-s">
            Recent taxonomy actions
          </h2>
          <ul className="va-divided">
            {data.actions.map((a) => (
              <li key={a.id} className="va-taxonomy-merge">
                <span>
                  {friendly(a.kind)} ·{" "}
                  {a.targetId.startsWith("features:") || a.targetId === "US"
                    ? `features (${a.targetId.replace("features:", "")})`
                    : name(a.targetId)}{" "}
                  · {dateLabel(a.createdAt)}
                  {a.reversedBy ? " · reversed" : ""}
                </span>
                {!a.reversedBy &&
                  ["category_update", "category_features"].includes(a.kind) && (
                    <button
                      type="button"
                      className="link-button"
                      disabled={action.busy}
                      onClick={() =>
                        void send(
                          `admin/taxonomy/actions/${a.id}/reverse`,
                          { note: "Reversed from the taxonomy workspace." },
                          "Action reversed.",
                        )
                      }
                    >
                      Reverse
                    </button>
                  )}
              </li>
            ))}
          </ul>
        </section>
      </CommunityControls>
    </PageShell>
  );
}

type Question = Category["dimensions"][number];
const questionKey = (label: string) =>
  label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(?=[0-9])/, "q_")
    .slice(0, 40);

// A food's ordered detail questions. Keys are fixed once saved, so a question
// is retired rather than removed; its answers are kept.
function DimensionEditor({
  category,
  busy,
  onSave,
}: {
  category: Category;
  busy: boolean;
  onSave: (dimensions: Question[], note: string) => Promise<void>;
}) {
  const [questions, setQuestions] = useState<Question[]>(category.dimensions);
  const [label, setLabel] = useState("");
  const saved = new Set(category.dimensions.map((d) => d.key));
  const move = (index: number, by: number) =>
    setQuestions((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });
  const update = (index: number, patch: Partial<Question>) =>
    setQuestions((list) =>
      list.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  const id = `questions-${category.id}`;
  return (
    <form
      className="community-form va-taxonomy-tree__form"
      aria-labelledby={id}
      onSubmit={(event) => {
        event.preventDefault();
        const note = String(new FormData(event.currentTarget).get("note"));
        void onSave(questions, note);
      }}
    >
      <h3 id={id} className="va-heading-s">
        Detail questions for {category.name}
      </h3>
      <p className="small muted">
        Asked after the overall score, in this order. Retired questions keep
        their answers but are no longer asked, shown or sorted.
      </p>
      <ol className="va-question-list">
        {questions.map((q, index) => (
          <li key={q.key}>
            <div className="form-field">
              <label htmlFor={`${id}-${q.key}`}>
                Label <span className="muted">({q.key})</span>
              </label>
              <input
                id={`${id}-${q.key}`}
                value={q.label}
                required
                minLength={2}
                maxLength={40}
                onChange={(event) =>
                  update(index, { label: event.target.value })
                }
              />
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={q.active}
                onChange={(event) =>
                  update(index, { active: event.target.checked })
                }
              />
              Asked
            </label>
            <span className="button-row">
              <button
                type="button"
                className="text-button"
                disabled={index === 0}
                aria-label={`Move ${q.label} up`}
                onClick={() => move(index, -1)}
              >
                Up
              </button>
              <button
                type="button"
                className="text-button"
                disabled={index === questions.length - 1}
                aria-label={`Move ${q.label} down`}
                onClick={() => move(index, 1)}
              >
                Down
              </button>
              {!saved.has(q.key) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setQuestions((list) => list.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ol>
      <div className="form-field">
        <label htmlFor={`${id}-new`}>New question</label>
        <span className="va-inline-field">
          <input
            id={`${id}-new`}
            value={label}
            maxLength={40}
            placeholder="For example, Melt"
            onChange={(event) => setLabel(event.target.value)}
          />
          <button
            type="button"
            className="button secondary"
            disabled={
              label.trim().length < 2 ||
              !questionKey(label) ||
              questions.some((q) => q.key === questionKey(label))
            }
            onClick={() => {
              setQuestions((list) => [
                ...list,
                {
                  key: questionKey(label),
                  label: label.trim(),
                  description: null,
                  active: true,
                },
              ]);
              setLabel("");
            }}
          >
            Add question
          </button>
        </span>
      </div>
      <div className="form-field">
        <label htmlFor={`${id}-note`}>Reason</label>
        <textarea
          id={`${id}-note`}
          name="note"
          required
          minLength={8}
          rows={2}
        />
      </div>
      <button className="button" disabled={busy}>
        Save questions
      </button>
    </form>
  );
}
