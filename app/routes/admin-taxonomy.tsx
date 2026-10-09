import { env } from "cloudflare:workers";
import { useState, type FormEvent } from "react";
import { Link, useRevalidator } from "react-router";
import { communityPageActor } from "@server/community/http/page";
import { taxonomyServices } from "@server/taxonomy/infrastructure/composition";
import { SiteShell } from "../components/catalog";
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
    [status, setStatus] = useState("");
  const name = (id: string | null) =>
    data.categories.find((c) => c.id === id)?.name ?? "—";
  const active = data.categories.filter((c) => c.isActive);
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
  return (
    <SiteShell>
      <CommunityControls>
        <nav className="breadcrumbs" aria-label="Moderation navigation">
          <Link to="/admin/moderation">Review inbox</Link>
          <span>Taxonomy</span>
        </nav>
        <header className="page-heading">
          <p className="eyebrow">Operator workspace</p>
          <h1>Taxonomy</h1>
          <p>
            Categories name conventional foods. Renamed slugs redirect; merges
            move ratings to the surviving category and can be reversed.
          </p>
        </header>
        <p role="status">{status}</p>
        <CommunityFeedback action={action} siteKey={data.siteKey} />

        <section
          className="community-panel"
          aria-labelledby="categories-heading"
        >
          <h2 id="categories-heading">Categories</h2>
          <ul className="contribution-list">
            {data.categories.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.name}</strong>{" "}
                  <span className="small muted">
                    /us/{c.slug} · parent {name(c.parentId)} ·{" "}
                    {c.isRankable ? "rankable" : "browse only"} ·{" "}
                    {c.isActive ? "active" : "retired"} · {c.productCount}{" "}
                    products
                  </span>
                  {c.aliases.length > 0 && (
                    <p className="small">
                      Also:{" "}
                      {c.aliases
                        .map((a) =>
                          a.country ? `${a.alias} (${a.country})` : a.alias,
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
                    className="community-form"
                    onSubmit={submit((form) =>
                      send(
                        `admin/taxonomy/categories/${c.id}`,
                        {
                          expectedRevision: c.revision,
                          name: form.get("name"),
                          slug: form.get("slug"),
                          parentId: form.get("parent") || null,
                          isRankable: form.get("rankable") === "on",
                          isActive: form.get("active") === "on",
                          // Unchanged aliases keep their market scope; new
                          // ones apply everywhere.
                          aliases: list(form.get("aliases")).map((alias) => {
                            const country = c.aliases.find(
                              (a) => a.alias === alias,
                            )?.country;
                            return country === "US"
                              ? { alias, country }
                              : { alias };
                          }),
                          note: form.get("note"),
                        },
                        `${c.name} updated.`,
                      ),
                    )}
                  >
                    <label htmlFor={`name-${c.id}`}>Name</label>
                    <input
                      id={`name-${c.id}`}
                      name="name"
                      defaultValue={c.name}
                      required
                    />
                    <label htmlFor={`slug-${c.id}`}>Slug</label>
                    <input
                      id={`slug-${c.id}`}
                      name="slug"
                      defaultValue={c.slug}
                      required
                    />
                    <label htmlFor={`parent-${c.id}`}>Parent</label>
                    <select
                      id={`parent-${c.id}`}
                      name="parent"
                      defaultValue={c.parentId ?? ""}
                    >
                      <option value="">None</option>
                      {active
                        .filter((p) => p.id !== c.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="rankable"
                        defaultChecked={c.isRankable === 1}
                      />
                      Rankable
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={c.isActive === 1}
                      />
                      Active
                    </label>
                    <label htmlFor={`aliases-${c.id}`}>
                      Aliases (comma separated)
                    </label>
                    <input
                      id={`aliases-${c.id}`}
                      name="aliases"
                      defaultValue={c.aliases.map((a) => a.alias).join(", ")}
                    />
                    <label htmlFor={`note-${c.id}`}>Reason</label>
                    <textarea
                      id={`note-${c.id}`}
                      name="note"
                      required
                      minLength={8}
                      rows={2}
                    />
                    <button className="button" disabled={action.busy}>
                      Save category
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="community-panel" aria-labelledby="create-heading">
          <h2 id="create-heading">Create a category</h2>
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
            <label htmlFor="new-name">Conventional food</label>
            <input id="new-name" name="name" required minLength={2} />
            <label htmlFor="new-slug">Slug (optional)</label>
            <input id="new-slug" name="slug" />
            <label htmlFor="new-parent">Parent</label>
            <select id="new-parent" name="parent" defaultValue="">
              <option value="">None</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="checkbox-label">
              <input type="checkbox" name="rankable" defaultChecked />
              Rankable
            </label>
            <label htmlFor="new-aliases">Aliases (comma separated)</label>
            <input id="new-aliases" name="aliases" />
            <label htmlFor="new-note">Reason</label>
            <textarea
              id="new-note"
              name="note"
              required
              minLength={8}
              rows={2}
            />
            <button className="button" disabled={action.busy}>
              Create category
            </button>
          </form>
        </section>

        <section className="community-panel" aria-labelledby="merge-heading">
          <h2 id="merge-heading">Merge duplicate categories</h2>
          <p className="small muted">
            Use only when both describe the same conventional food. Ratings move
            to the survivor; if someone rated a product in both, their most
            recent rating counts and the other is kept uncounted.
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
              <div key={role}>
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
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <label htmlFor="merge-note">Reason</label>
            <textarea
              id="merge-note"
              name="note"
              required
              minLength={8}
              rows={2}
            />
            <button className="button" disabled={action.busy}>
              Merge categories
            </button>
          </form>
          {data.merges.length > 0 && (
            <ul className="contribution-list">
              {data.merges.map((m) => (
                <li key={m.id}>
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
                      <label htmlFor={`reverse-${m.id}`}>
                        Reason to reverse
                      </label>
                      <input
                        id={`reverse-${m.id}`}
                        name="note"
                        required
                        minLength={8}
                      />
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

        <section className="community-panel" aria-labelledby="features-heading">
          <h2 id="features-heading">Homepage features</h2>
          <p className="small muted">
            Merchandising order, independent of the hierarchy.
          </p>
          <form
            className="community-form"
            onSubmit={submit((form) =>
              send(
                "admin/taxonomy/features",
                {
                  categoryIds: [0, 1, 2, 3, 4, 5]
                    .map((i) => String(form.get(`feature-${i}`) ?? ""))
                    .filter(Boolean),
                  note: form.get("note"),
                },
                "Homepage features saved.",
              ),
            )}
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <label htmlFor={`feature-${i}`}>Position {i + 1}</label>
                <select
                  id={`feature-${i}`}
                  name={`feature-${i}`}
                  defaultValue={data.features[i]?.categoryId ?? ""}
                >
                  <option value="">Empty</option>
                  {active
                    .filter((c) => c.isRankable)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
            ))}
            <label htmlFor="features-note">Reason</label>
            <textarea
              id="features-note"
              name="note"
              required
              minLength={8}
              rows={2}
            />
            <button className="button" disabled={action.busy}>
              Save features
            </button>
          </form>
        </section>

        <section className="community-panel" aria-labelledby="actions-heading">
          <h2 id="actions-heading">Recent taxonomy actions</h2>
          <ul className="contribution-list">
            {data.actions.map((a) => (
              <li key={a.id}>
                <span>
                  {friendly(a.kind)} · {name(a.targetId)} ·{" "}
                  {dateLabel(a.createdAt)}
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
    </SiteShell>
  );
}
