/**
 * Run before migration 0011, which rebuilds the comments table. The table was
 * never written before milestone 4, so the rebuild drops it; refuse to start if
 * any environment unexpectedly holds comments or reactions.
 */
export async function checkCommentRebuild(db: D1Database) {
  const tables = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('comments','comment_reactions','comment_votes')",
      )
      .all<{ name: string }>()
  ).results.map((r) => r.name);
  if (tables.includes("comment_votes") || !tables.includes("comments"))
    return { comments: 0, reactions: 0 };
  const count = async (table: string) =>
    tables.includes(table)
      ? ((await db
          .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
          .first<number>("n")) ?? 0)
      : 0;
  const result = {
    comments: await count("comments"),
    reactions: await count("comment_reactions"),
  };
  if (result.comments || result.reactions)
    throw new Error(
      `Migration 0011 rebuilds comments but found ${result.comments} comments and ${result.reactions} reactions. Export and migrate them deliberately before upgrading.`,
    );
  return result;
}
