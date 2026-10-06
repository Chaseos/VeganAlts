// Rebuildable FTS documents. Recursive ancestry is computed during maintenance,
// never during a public search. UNION deduplicates malformed ancestry cycles.
const ancestry = `WITH RECURSIVE ancestry(leaf,id,name,parent_id) AS (
  SELECT id,id,name,parent_id FROM categories WHERE is_active=1
  UNION SELECT a.leaf,c.id,c.name,c.parent_id FROM ancestry a JOIN categories c ON c.id=a.parent_id WHERE c.is_active=1
)`;

export const SEARCH_INDEX_STATEMENTS = [
  "DELETE FROM search_index",
  `${ancestry} INSERT INTO search_index(entity_type,entity_id,country_code,title,subtitle,aliases,body)
    SELECT 'category',c.id,country.iso2,c.name,'Category',
      COALESCE((SELECT group_concat(alias,' ') FROM category_aliases ca WHERE ca.category_id=c.id AND (ca.country_id IS NULL OR ca.country_id=country.id)),''),
      (SELECT group_concat(name,' ') FROM ancestry a WHERE a.leaf=c.id)
    FROM categories c CROSS JOIN countries country WHERE c.is_active=1 AND country.is_active=1`,
  `${ancestry} INSERT INTO search_index(entity_type,entity_id,country_code,title,subtitle,aliases,body)
    SELECT 'product',p.id,country.iso2,p.name,COALESCE(b.name,''),
      COALESCE((SELECT group_concat(alias,' ') FROM product_aliases pa WHERE pa.product_id=p.id),'') || ' ' ||
      COALESCE((SELECT group_concat(ca.alias,' ') FROM product_categories pc JOIN category_aliases ca ON ca.category_id=pc.category_id WHERE pc.product_id=p.id AND (ca.country_id IS NULL OR ca.country_id=country.id)),''),
      COALESCE((SELECT group_concat(a.name,' ') FROM product_categories pc JOIN ancestry a ON a.leaf=pc.category_id WHERE pc.product_id=p.id),'')
    FROM products p JOIN countries country ON country.id=p.country_id LEFT JOIN brands b ON b.id=p.brand_id
    WHERE p.lifecycle_status<>'hidden' AND country.is_active=1`,
] as const;

export async function rebuildSearchIndex(db: D1Database) {
  await db.batch(SEARCH_INDEX_STATEMENTS.map((sql) => db.prepare(sql)));
}
