/**
 * Resolve a renamed or merged category slug to the active category it now
 * belongs to. Returns null when the slug is current or unknown. Bounded so a
 * malformed chain can never loop. Public loaders call it only on a miss and
 * return the redirect uncached.
 */
export async function resolveCategoryRedirect(db: D1Database, slug: string) {
  let current = slug;
  for (let hop = 0; hop < 8; hop++) {
    const row = await db
      .prepare(
        `SELECT c.slug,c.is_active AS active,
        (SELECT s.slug FROM category_merges m JOIN categories s ON s.id=m.survivor_id WHERE m.donor_id=c.id AND m.active=1 AND m.state='complete') AS mergedInto
        FROM categories c WHERE c.slug=? OR c.id=(SELECT category_id FROM category_slug_history WHERE old_slug=?) ORDER BY c.slug=? DESC LIMIT 1`,
      )
      .bind(current, current, current)
      .first<{ slug: string; active: number; mergedInto: string | null }>();
    if (!row) return null;
    if (row.active === 1) return row.slug === slug ? null : row.slug;
    if (!row.mergedInto) return null;
    current = row.mergedInto;
  }
  return null;
}
