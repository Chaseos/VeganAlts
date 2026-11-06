// Rebuildable FTS documents. Recursive ancestry is computed during maintenance,
// never during a public search. UNION deduplicates malformed ancestry cycles.
const ancestry = `WITH RECURSIVE ancestry(leaf,id,name,parent_id) AS (
  SELECT id,id,name,parent_id FROM categories WHERE is_active=1
  UNION SELECT a.leaf,c.id,c.name,c.parent_id FROM ancestry a JOIN categories c ON c.id=a.parent_id WHERE c.is_active=1
)`;

// `segmented` makes scripts without spaces searchable. `unicode61` reads a run
// of Japanese as one word, so 揚げ wouldn't find 唐揚げ. Here each such character
// is its own token, katakana folded to hiragana, and queries are phrases. A
// ligature's plain spelling goes here too, so "oeufs" finds "Œufs".
const SPACELESS = `u BETWEEN 3584 AND 3711 OR u BETWEEN 12353 AND 12543 OR u BETWEEN 13312 AND 40959 OR u BETWEEN 44032 AND 55215 OR u BETWEEN 63744 AND 64255`;
const segmented = (text: string) => `CASE WHEN ${text} GLOB '*[^ -~]*' THEN
  (SELECT group_concat(piece,'') FROM (
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<length(${text}))
    SELECT CASE
      WHEN u BETWEEN 12449 AND 12534 THEN ' '||char(u-96)||' '
      WHEN ${SPACELESS} THEN ' '||c||' '
      ELSE ' ' END AS piece
    FROM (SELECT i,substr(${text},i,1) AS c,unicode(substr(${text},i,1)) AS u FROM n) ORDER BY i
  ))||' '||replace(replace(replace(replace(${text},'œ','oe'),'Œ','oe'),'æ','ae'),'Æ','ae')
  ELSE '' END`;

// Foods only: aisles are navigation, reached through their foods' ancestry
// ("cheese" finds every food in the Cheese aisle). A food is
// indexed only in the countries where it is on; its title is its name in that
// country and its base name stays searchable.
const categoryDocuments = (where: string) =>
  `${ancestry} INSERT INTO search_index(entity_type,entity_id,country_code,title,subtitle,aliases,body,segmented)
    SELECT d.*,${segmented("(d.title||' '||d.aliases)")} FROM (SELECT 'category',c.id,country.iso2,
      COALESCE((SELECT alias FROM category_aliases d WHERE d.category_id=c.id AND d.country_id=country.id AND d.is_display_name=1 AND d.language='en'),c.name) AS title,'Category',
      c.name || ' ' || COALESCE((SELECT group_concat(alias,' ') FROM category_aliases ca WHERE ca.category_id=c.id AND (ca.country_id IS NULL OR ca.country_id=country.id)),'') AS aliases,
      (SELECT group_concat(name,' ') FROM ancestry a WHERE a.leaf=c.id)
    FROM categories c JOIN category_countries cc ON cc.category_id=c.id
    JOIN countries country ON country.id=cc.country_id AND country.is_active=1
    WHERE c.is_active=1 AND c.is_rankable=1${where}) d`;

export const SEARCH_INDEX_STATEMENTS = [
  "DELETE FROM search_index",
  categoryDocuments(""),
  `${ancestry} INSERT INTO search_index(entity_type,entity_id,country_code,title,subtitle,aliases,body,segmented)
    SELECT d.*,${segmented("(d.title||' '||d.brand||' '||d.aliases)")} FROM (SELECT 'product',p.id,country.iso2,p.name AS title,COALESCE(b.name,'') AS brand,
      COALESCE((SELECT group_concat(alias,' ') FROM product_aliases pa WHERE pa.product_id=p.id),'') || ' ' ||
      COALESCE((SELECT group_concat(ca.alias,' ') FROM product_categories pc JOIN category_aliases ca ON ca.category_id=pc.category_id WHERE pc.product_id=p.id AND (ca.country_id IS NULL OR ca.country_id=country.id)),'') AS aliases,
      COALESCE((SELECT group_concat(a.name,' ') FROM product_categories pc JOIN ancestry a ON a.leaf=pc.category_id WHERE pc.product_id=p.id),'')
    FROM products p JOIN countries country ON country.id=p.country_id LEFT JOIN brands b ON b.id=p.brand_id
    WHERE p.lifecycle_status<>'hidden' AND country.is_active=1) d`,
  // Brand lookups' trigram index; triggers keep it current between rebuilds.
  "DELETE FROM brand_search",
  `INSERT INTO brand_search(brand_id,aliases,names)
    SELECT b.id,(SELECT json_group_array(alias) FROM brand_aliases WHERE brand_id=b.id),
      b.name||' '||COALESCE((SELECT group_concat(alias,' ') FROM brand_aliases WHERE brand_id=b.id),'')
    FROM brands b`,
] as const;

export async function rebuildSearchIndex(db: D1Database) {
  await db.batch(SEARCH_INDEX_STATEMENTS.map((sql) => db.prepare(sql)));
}

// Used inside the same fenced transaction as a material catalog change.
export function productSearchStatements(
  db: D1Database,
  productId: string,
  guard = "1",
  parameters: (string | number)[] = [],
) {
  return [
    db
      .prepare(
        `DELETE FROM search_index WHERE entity_type='product' AND entity_id=? AND (${guard})`,
      )
      .bind(productId, ...parameters),
    db
      .prepare(
        SEARCH_INDEX_STATEMENTS[2].replace(
          "WHERE p.lifecycle_status<>'hidden'",
          `WHERE p.id=? AND (${guard}) AND p.lifecycle_status<>'hidden'`,
        ),
      )
      .bind(productId, ...parameters),
  ];
}

// Publishing a product can switch its foods on in its country; index any of
// them that the country's search does not list yet, in the same batch.
export function categorySearchStatements(
  db: D1Database,
  productId: string,
  guard = "1",
  parameters: (string | number)[] = [],
) {
  return [
    db
      .prepare(
        categoryDocuments(
          ` AND country.id=(SELECT country_id FROM products WHERE id=?)
          AND c.id IN (SELECT category_id FROM product_categories WHERE product_id=?) AND (${guard})
          AND NOT EXISTS(SELECT 1 FROM search_index s WHERE s.entity_type='category' AND s.entity_id=c.id AND s.country_code=country.iso2)`,
        ),
      )
      .bind(productId, productId, ...parameters),
  ];
}
