-- VeganAlts application database baseline v1.0
-- Target: Cloudflare D1 / SQLite
-- Better Auth tables are generated separately and MUST be applied before this migration.
-- Timestamps are UTC Unix epoch milliseconds and are written by application code.
-- IDs are application-generated TEXT IDs (recommended UUIDv7).

PRAGMA defer_foreign_keys = on;

CREATE TABLE countries (
  id TEXT PRIMARY KEY,
  iso2 TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  trust_level INTEGER NOT NULL DEFAULT 0 CHECK (trust_level >= 0),
  account_state TEXT NOT NULL DEFAULT 'active'
    CHECK (account_state IN ('active', 'restricted', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_rankable INTEGER NOT NULL DEFAULT 0 CHECK (is_rankable IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX ix_categories_parent_active
  ON categories(parent_id, is_active);

CREATE TABLE category_aliases (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  country_id TEXT REFERENCES countries(id) ON DELETE CASCADE,
  alias TEXT NOT NULL COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  UNIQUE(category_id, country_id, alias)
);

CREATE INDEX ix_category_aliases_alias
  ON category_aliases(alias);

CREATE TABLE category_rating_dimensions (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(category_id, key)
);

CREATE TABLE brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  website_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE product_families (
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  canonical_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  country_id TEXT NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  product_family_id TEXT REFERENCES product_families(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  product_type TEXT NOT NULL DEFAULT 'packaged_food'
    CHECK (product_type IN ('packaged_food', 'restaurant_item', 'recipe', 'material')),
  lifecycle_status TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'under_review', 'discontinued', 'hidden')),
  vegan_status TEXT NOT NULL DEFAULT 'appears_vegan'
    CHECK (vegan_status IN ('vegan', 'appears_vegan', 'plant_based', 'under_review')),
  manufacturer_label TEXT NOT NULL DEFAULT 'unknown'
    CHECK (manufacturer_label IN ('vegan', 'plant_based', 'neither', 'unknown')),
  manufacturer_url TEXT,
  created_by TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(country_id, slug)
);

CREATE INDEX ix_products_country_status
  ON products(country_id, lifecycle_status, updated_at DESC);

CREATE INDEX ix_products_brand_country
  ON products(brand_id, country_id);

CREATE TABLE product_aliases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL COLLATE NOCASE,
  created_at INTEGER NOT NULL,
  UNIQUE(product_id, alias)
);

CREATE INDEX ix_product_aliases_alias
  ON product_aliases(alias);

CREATE TABLE product_versions (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version_label TEXT,
  effective_from INTEGER,
  effective_to INTEGER,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  change_summary TEXT,
  created_by TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX ix_product_versions_product
  ON product_versions(product_id, effective_from DESC);

CREATE UNIQUE INDEX ux_product_versions_current
  ON product_versions(product_id)
  WHERE is_current = 1;

CREATE TABLE product_categories (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  ranking_eligible INTEGER NOT NULL DEFAULT 1 CHECK (ranking_eligible IN (0, 1)),
  created_by TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX ix_product_categories_category_eligible
  ON product_categories(category_id, ranking_eligible, product_id);

CREATE TABLE product_relationships (
  from_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  to_product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL
    CHECK (relation_type IN ('variant', 'specialty_flavor', 'companion', 'successor')),
  created_by TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_product_id, to_product_id, relation_type),
  CHECK (from_product_id <> to_product_id)
);

CREATE TABLE product_trials (
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  product_version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, product_version_id)
);

CREATE INDEX ix_product_trials_version
  ON product_trials(product_version_id);

CREATE TABLE ratings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  product_version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  overall_similarity INTEGER NOT NULL CHECK (overall_similarity BETWEEN 1 AND 5),
  conventional_recency TEXT
    CHECK (conventional_recency IS NULL OR conventional_recency IN (
      'current_or_week',
      'within_month',
      'within_year',
      'over_year',
      'prefer_not_to_say'
    )),
  is_counted INTEGER NOT NULL DEFAULT 1 CHECK (is_counted IN (0, 1)),
  moderation_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, product_version_id, category_id)
);

CREATE INDEX ix_ratings_version_category_counted
  ON ratings(product_version_id, category_id, is_counted);

CREATE INDEX ix_ratings_user_updated
  ON ratings(user_id, updated_at DESC);

CREATE TABLE rating_dimension_values (
  rating_id TEXT NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  dimension_id TEXT NOT NULL REFERENCES category_rating_dimensions(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (rating_id, dimension_id)
);

CREATE TABLE product_category_stats (
  product_version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  rating_sum INTEGER NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  raw_average REAL,
  bayesian_score REAL,
  tried_count INTEGER NOT NULL DEFAULT 0 CHECK (tried_count >= 0),
  recent_rating_count INTEGER NOT NULL DEFAULT 0 CHECK (recent_rating_count >= 0),
  trending_score REAL,
  recomputed_at INTEGER NOT NULL,
  PRIMARY KEY (product_version_id, category_id)
);

CREATE INDEX ix_product_category_stats_top
  ON product_category_stats(category_id, bayesian_score DESC, rating_count DESC);

CREATE INDEX ix_product_category_stats_trending
  ON product_category_stats(category_id, trending_score DESC);

CREATE TABLE product_category_daily_stats (
  stat_date TEXT NOT NULL,
  product_version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  new_rating_count INTEGER NOT NULL DEFAULT 0 CHECK (new_rating_count >= 0),
  rating_sum INTEGER NOT NULL DEFAULT 0 CHECK (rating_sum >= 0),
  new_trial_count INTEGER NOT NULL DEFAULT 0 CHECK (new_trial_count >= 0),
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  PRIMARY KEY (stat_date, product_version_id, category_id)
);

CREATE INDEX ix_daily_stats_category_date
  ON product_category_daily_stats(category_id, stat_date DESC);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  product_version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  moderation_state TEXT NOT NULL DEFAULT 'visible'
    CHECK (moderation_state IN ('visible', 'hidden', 'removed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX ix_comments_version_created
  ON comments(product_version_id, created_at DESC);

CREATE TABLE comment_reactions (
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'helpful' CHECK (reaction = 'helpful'),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, user_id, reaction)
);

CREATE TABLE retailers (
  id TEXT PRIMARY KEY,
  canonical_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  website_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE retailer_markets (
  retailer_id TEXT NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  country_id TEXT NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  market_name TEXT,
  website_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (retailer_id, country_id)
);

CREATE TABLE product_retailers (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  retailer_id TEXT NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'uncertain', 'not_current')),
  confirmation_count INTEGER NOT NULL DEFAULT 0 CHECK (confirmation_count >= 0),
  disagreement_count INTEGER NOT NULL DEFAULT 0 CHECK (disagreement_count >= 0),
  last_confirmed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (product_id, retailer_id)
);

CREATE INDEX ix_product_retailers_product_status
  ON product_retailers(product_id, status);

CREATE TABLE retailer_confirmations (
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  retailer_id TEXT NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  stance TEXT NOT NULL CHECK (stance IN ('confirm', 'not_current')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, product_id, retailer_id)
);

CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_version_id TEXT NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  slot TEXT NOT NULL
    CHECK (slot IN ('front', 'back', 'ingredients', 'nutrition', 'prepared')),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'accepted', 'rejected', 'archived')),
  full_r2_key TEXT NOT NULL,
  thumbnail_r2_key TEXT,
  full_width INTEGER,
  full_height INTEGER,
  mime_type TEXT NOT NULL DEFAULT 'image/webp',
  submitted_by TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX ix_product_images_version_slot_state
  ON product_images(product_version_id, slot, state);

CREATE UNIQUE INDEX ux_product_images_accepted_slot
  ON product_images(product_version_id, slot)
  WHERE state = 'accepted';

CREATE TABLE edit_proposals (
  id TEXT PRIMARY KEY,
  submitted_by TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('product', 'product_version', 'product_image', 'product_category', 'product_retailer', 'retailer')),
  target_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  risk_tier INTEGER NOT NULL CHECK (risk_tier BETWEEN 1 AND 3),
  proposed_data TEXT NOT NULL, -- JSON text validated by application
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded', 'withdrawn')),
  resolved_by TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  resolution_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX ix_edit_proposals_queue
  ON edit_proposals(status, risk_tier DESC, created_at ASC);

CREATE INDEX ix_edit_proposals_target
  ON edit_proposals(target_type, target_id, status);

CREATE TABLE edit_proposal_responses (
  proposal_id TEXT NOT NULL REFERENCES edit_proposals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  stance TEXT NOT NULL CHECK (stance IN ('confirm', 'disagree', 'evidence')),
  note TEXT,
  evidence_data TEXT, -- JSON text if needed
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, user_id)
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  target_type TEXT NOT NULL
    CHECK (target_type IN ('product', 'product_version', 'product_image', 'comment', 'edit_proposal', 'profile')),
  target_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
  resolved_by TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  resolution_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER
);

CREATE INDEX ix_reports_queue
  ON reports(status, created_at ASC);

CREATE INDEX ix_reports_target
  ON reports(target_type, target_id, status);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES profiles(user_id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_data TEXT, -- JSON text
  after_data TEXT,  -- JSON text
  source_proposal_id TEXT REFERENCES edit_proposals(id) ON DELETE SET NULL,
  source_report_id TEXT REFERENCES reports(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX ix_audit_entity
  ON audit_log(entity_type, entity_id, created_at DESC);

-- Derived FTS index. Application code owns synchronization/rebuild.
CREATE VIRTUAL TABLE search_index USING fts5(
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  country_code UNINDEXED,
  title,
  subtitle,
  aliases,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

PRAGMA defer_foreign_keys = off;