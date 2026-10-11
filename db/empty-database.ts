/**
 * Drops every table, view and trigger, including Wrangler's migration ledger,
 * so the migrations recreate the database from version 1. One transaction:
 * either everything goes or nothing does. D1's internal `_cf_` tables stay.
 */
export async function emptyDatabase(db: D1Database) {
  const objects = (
    await db
      .prepare(
        `SELECT type,name,sql FROM sqlite_master
        WHERE type IN ('trigger','view','table') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`,
      )
      .all<{ type: "trigger" | "view" | "table"; name: string; sql: string }>()
  ).results;
  // FTS5 shadow tables go with their virtual table.
  const virtual = objects
    .filter((o) => o.sql.startsWith("CREATE VIRTUAL TABLE"))
    .map((o) => o.name);
  const shadow = (name: string) =>
    virtual.some((table) => name !== table && name.startsWith(`${table}_`));
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  // A dropped table is deleted from first, which checks its foreign keys, so a
  // table goes only after every table referencing it.
  const tables = objects
    .filter((o) => o.type === "table" && !shadow(o.name))
    .map((o) => o.name);
  const keys = await db.batch<{ table: string }>(
    tables.map((table) =>
      db.prepare(`PRAGMA foreign_key_list(${quote(table)})`),
    ),
  );
  const references = tables.flatMap((child, index) =>
    keys[index]!.results.filter((key) => key.table !== child).map((key) => ({
      child,
      parent: key.table,
    })),
  );
  const ordered: string[] = [];
  for (let remaining = new Set(tables); remaining.size > 0;) {
    const free = [...remaining].filter(
      (table) =>
        !references.some((r) => r.parent === table && remaining.has(r.child)),
    );
    if (free.length === 0)
      throw new Error("Foreign keys form a cycle; drop these tables by hand.");
    for (const table of free) {
      ordered.push(table);
      remaining.delete(table);
    }
  }
  const drops = [
    ...objects
      .filter((o) => o.type === "trigger" || o.type === "view")
      .sort((a, b) => a.type.localeCompare(b.type)),
    ...ordered.map((name) => ({ type: "table" as const, name })),
  ].map((o) =>
    db.prepare(`DROP ${o.type.toUpperCase()} IF EXISTS ${quote(o.name)}`),
  );
  // Foreign keys are checked when the transaction ends, by which time every
  // table is gone.
  await db.batch([db.prepare("PRAGMA defer_foreign_keys = on"), ...drops]);
  return drops.length;
}
