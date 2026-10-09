import { ApplicationError } from "../../shared/domain/errors";
import type {
  ActionWrite,
  DecisionGuard,
  ModerationRepository,
} from "../../community/infrastructure/moderation-repository";
import type { ReceiptWrite } from "../../community/infrastructure/receipts";
import { SYSTEM_ACTOR_ID } from "../../community/domain/policy";
import type { CategoryPatch, CategoryState } from "../domain/taxonomy";
import { resolveCategoryRedirect } from "./redirects";

export interface CategoryRecord extends CategoryState {
  id: string;
  revision: number;
  productCount: number;
  ratingDimensions: number;
}
export interface MergeRecord {
  id: string;
  donor_id: string;
  survivor_id: string;
  action_id: string;
  state: "transferring" | "complete" | "reversing" | "reversed";
  active: number;
  page_token: string | null;
  finalize_data: string | null;
  created_at: number;
}
export interface FinalizeData {
  children: string[];
  aliasIds: string[];
  feature: { position: number; survivorFeatured: boolean } | null;
}
interface PageRating {
  id: string;
  user_id: string;
  product_version_id: string;
  product_id: string;
  is_counted: number;
  updated_at: number;
  survivor_id: string | null;
  survivor_updated_at: number | null;
  survivor_counted: number | null;
}

const PAGE = 400;
export class D1TaxonomyRepository {
  constructor(
    private readonly moderation: ModerationRepository,
    private readonly newId: () => string,
  ) {}
  private get db() {
    return this.moderation.db;
  }
  commit(
    action: ActionWrite,
    guard: DecisionGuard,
    build: (fence: DecisionGuard) => D1PreparedStatement[],
    receipt: ReceiptWrite,
  ) {
    return this.moderation.commit(action, guard, build, receipt);
  }
  replay<T>(receipt: ReceiptWrite) {
    return this.moderation.replay<T>(receipt);
  }
  action(id: string) {
    return this.moderation.action(id);
  }
  async category(id: string): Promise<CategoryRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT c.id,c.name,c.slug,c.parent_id AS parentId,c.is_rankable AS isRankable,c.is_active AS isActive,c.revision,
        (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id=c.id) AS productCount,
        (SELECT COUNT(*) FROM category_rating_dimensions d WHERE d.category_id=c.id) AS ratingDimensions,
        (SELECT json_group_array(json_object('alias',a.alias,'countryId',a.country_id)) FROM category_aliases a WHERE a.category_id=c.id) AS aliases
        FROM categories c WHERE c.id=?`,
      )
      .bind(id)
      .first<
        Omit<CategoryRecord, "aliases" | "isRankable" | "isActive"> & {
          aliases: string;
          isRankable: number;
          isActive: number;
        }
      >();
    if (!row) return null;
    return {
      ...row,
      isRankable: row.isRankable === 1,
      isActive: row.isActive === 1,
      aliases: JSON.parse(row.aliases) as CategoryState["aliases"],
    };
  }
  async tree() {
    const [categories, features, merges, actions] = await this.db.batch([
      this.db.prepare(
        `SELECT c.id,c.name,c.slug,c.parent_id AS parentId,c.is_rankable AS isRankable,c.is_active AS isActive,c.revision,
        (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id=c.id) AS productCount,
        (SELECT json_group_array(json_object('alias',a.alias,'country',co.iso2)) FROM category_aliases a LEFT JOIN countries co ON co.id=a.country_id WHERE a.category_id=c.id) AS aliases
        FROM categories c ORDER BY c.is_active DESC,c.name LIMIT 500`,
      ),
      this.db.prepare(
        "SELECT f.category_id AS categoryId,f.position FROM category_features f JOIN countries co ON co.id=f.country_id AND co.iso2='US' ORDER BY f.position",
      ),
      this.db.prepare(
        "SELECT m.id,m.donor_id AS donorId,m.survivor_id AS survivorId,m.state,m.created_at AS createdAt FROM category_merges m WHERE m.active=1 ORDER BY m.created_at DESC LIMIT 50",
      ),
      this.db.prepare(
        "SELECT a.id,a.kind,a.target_id AS targetId,a.note,a.reversed_by AS reversedBy,a.created_at AS createdAt FROM moderation_actions a WHERE a.kind IN ('category_create','category_update','category_features','category_merge','category_proposal_reject') ORDER BY a.created_at DESC LIMIT 20",
      ),
    ]);
    return {
      categories: (
        categories!.results as {
          id: string;
          name: string;
          slug: string;
          parentId: string | null;
          isRankable: number;
          isActive: number;
          revision: number;
          productCount: number;
          aliases: string;
        }[]
      ).map((c) => ({
        ...c,
        // Scope travels with each alias so an edit can preserve it.
        aliases: JSON.parse(c.aliases) as {
          alias: string;
          country: string | null;
        }[],
      })),
      features: features!.results as { categoryId: string; position: number }[],
      merges: merges!.results as {
        id: string;
        donorId: string;
        survivorId: string;
        state: string;
        createdAt: number;
      }[],
      actions: actions!.results as {
        id: string;
        kind: string;
        targetId: string;
        note: string;
        reversedBy: string | null;
        createdAt: number;
      }[],
    };
  }
  /** Names and aliases of every category, for duplicate detection. */
  async names() {
    return (
      await this.db
        .prepare(
          "SELECT c.id,c.name AS value,c.is_active AS active FROM categories c UNION ALL SELECT a.category_id,a.alias,c.is_active FROM category_aliases a JOIN categories c ON c.id=a.category_id",
        )
        .all<{ id: string; value: string; active: number }>()
    ).results;
  }
  async slugOwner(slug: string) {
    return this.db
      .prepare(
        "SELECT id FROM categories WHERE slug=? UNION ALL SELECT category_id FROM category_slug_history WHERE old_slug=? LIMIT 1",
      )
      .bind(slug, slug)
      .first<string>("id");
  }
  /** Ancestors of a category, nearest first, bounded against cycles. */
  async ancestors(id: string) {
    return (
      await this.db
        .prepare(
          `WITH RECURSIVE up(id,parent_id,depth) AS (SELECT id,parent_id,0 FROM categories WHERE id=?
          UNION SELECT c.id,c.parent_id,up.depth+1 FROM categories c JOIN up ON c.id=up.parent_id WHERE up.depth<20)
          SELECT id FROM up WHERE depth>0 ORDER BY depth`,
        )
        .bind(id)
        .all<{ id: string }>()
    ).results.map((r) => r.id);
  }
  redirect(slug: string) {
    return resolveCategoryRedirect(this.db, slug);
  }
  categoryStatements(
    id: string,
    current: CategoryRecord,
    patch: CategoryPatch,
    now: number,
    fence: DecisionGuard,
  ) {
    const { sql, values } = fence;
    const statements = [
      this.db
        .prepare(
          `UPDATE categories SET name=?,slug=?,parent_id=?,is_rankable=?,is_active=?,revision=revision+1,updated_at=? WHERE id=? AND ${sql}`,
        )
        .bind(
          patch.name ?? current.name,
          patch.slug ?? current.slug,
          patch.parentId === undefined ? current.parentId : patch.parentId,
          Number(patch.isRankable ?? current.isRankable),
          Number(patch.isActive ?? current.isActive),
          now,
          id,
          ...values,
        ),
    ];
    if (patch.slug && patch.slug !== current.slug)
      statements.push(
        // Renaming back to an earlier slug reclaims it from the history.
        this.db
          .prepare(
            `DELETE FROM category_slug_history WHERE old_slug=? AND category_id=? AND ${sql}`,
          )
          .bind(patch.slug, id, ...values),
        this.db
          .prepare(
            `INSERT INTO category_slug_history(old_slug,category_id,created_at) SELECT ?,?,? WHERE ${sql} ON CONFLICT(old_slug) DO UPDATE SET category_id=excluded.category_id`,
          )
          .bind(current.slug, id, now, ...values),
      );
    if (patch.aliases)
      statements.push(
        this.db
          .prepare(
            `DELETE FROM category_aliases WHERE category_id=? AND ${sql}`,
          )
          .bind(id, ...values),
        ...patch.aliases.map((a) =>
          this.db
            .prepare(
              `INSERT INTO category_aliases(id,category_id,country_id,alias,created_at) SELECT ?,?,?,?,? WHERE ${sql}`,
            )
            .bind(this.newId(), id, a.countryId, a.alias, now, ...values),
        ),
      );
    return statements;
  }
  createStatements(
    id: string,
    input: {
      name: string;
      slug: string;
      parentId: string | null;
      isRankable: boolean;
      aliases: string[];
    },
    now: number,
    fence: DecisionGuard,
  ) {
    return [
      this.db
        .prepare(
          `INSERT INTO categories(id,parent_id,slug,name,is_rankable,is_active,created_at,updated_at) SELECT ?,?,?,?,?,1,?,? WHERE ${fence.sql}`,
        )
        .bind(
          id,
          input.parentId,
          input.slug,
          input.name,
          Number(input.isRankable),
          now,
          now,
          ...fence.values,
        ),
      ...input.aliases.map((alias) =>
        this.db
          .prepare(
            `INSERT INTO category_aliases(id,category_id,country_id,alias,created_at) SELECT ?,?,NULL,?,? WHERE ${fence.sql} ON CONFLICT DO NOTHING`,
          )
          .bind(this.newId(), id, alias, now, ...fence.values),
      ),
    ];
  }
  featureStatements(categoryIds: string[], now: number, fence: DecisionGuard) {
    return [
      this.db
        .prepare(
          `DELETE FROM category_features WHERE country_id=(SELECT id FROM countries WHERE iso2='US') AND ${fence.sql}`,
        )
        .bind(...fence.values),
      ...categoryIds.map((categoryId, index) =>
        this.db
          .prepare(
            `INSERT INTO category_features(country_id,category_id,position,updated_at) SELECT co.id,c.id,?,? FROM countries co JOIN categories c ON c.id=? AND c.is_active=1 WHERE co.iso2='US' AND ${fence.sql}`,
          )
          .bind(index + 1, now, categoryId, ...fence.values),
      ),
    ];
  }
  async features() {
    return (
      await this.db
        .prepare(
          "SELECT f.category_id AS categoryId FROM category_features f JOIN countries co ON co.id=f.country_id AND co.iso2='US' ORDER BY f.position",
        )
        .all<{ categoryId: string }>()
    ).results.map((r) => r.categoryId);
  }

  async usCountryId() {
    return this.db
      .prepare("SELECT id FROM countries WHERE iso2='US'")
      .first<string>("id");
  }
  markReversed(originalId: string, reversalId: string, fence: DecisionGuard) {
    return this.db
      .prepare(
        `UPDATE moderation_actions SET reversed_by=? WHERE id=? AND reversed_by IS NULL AND ${fence.sql}`,
      )
      .bind(reversalId, originalId, ...fence.values);
  }
  async unfinishedMerges() {
    return (
      await this.db
        .prepare(
          "SELECT id FROM category_merges WHERE state IN ('transferring','reversing') ORDER BY created_at LIMIT 5",
        )
        .all<{ id: string }>()
    ).results;
  }

  // ---- Category proposals -------------------------------------------------
  /** Category proposals an account has made since a time. */
  async proposalsSince(userId: string, since: number) {
    return (await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM category_proposals WHERE submitted_by=? AND created_at>=?",
      )
      .bind(userId, since)
      .first<number>("n"))!;
  }
  async createProposal(
    proposal: {
      id: string;
      userId: string;
      name: string;
      parentId: string | null;
      explanation: string;
      data: unknown;
      perDay: number;
    },
    receipt: ReceiptWrite,
  ) {
    const day = Math.floor(receipt.now / 86_400_000) * 86_400_000;
    const created = "EXISTS(SELECT 1 FROM category_proposals WHERE id=?)";
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO category_proposals(id,submitted_by,name,parent_id,country_id,explanation,proposed_data,created_at,updated_at)
          SELECT ?,?,?,?,(SELECT id FROM countries WHERE iso2='US'),?,?,?,? WHERE (SELECT COUNT(*) FROM category_proposals WHERE submitted_by=? AND created_at>=?) < ?
          AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')`,
        )
        .bind(
          proposal.id,
          proposal.userId,
          proposal.name,
          proposal.parentId,
          proposal.explanation,
          JSON.stringify(proposal.data),
          receipt.now,
          receipt.now,
          proposal.userId,
          day,
          proposal.perDay,
          proposal.userId,
        ),
      this.db
        .prepare(
          `INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,?,? WHERE ${created}`,
        )
        .bind(
          receipt.userId,
          receipt.operation,
          receipt.key,
          receipt.hash,
          JSON.stringify({ id: proposal.id }),
          receipt.now,
          proposal.id,
        ),
    ]);
    if (!results[0]!.meta.changes)
      throw new ApplicationError(
        "PROPOSAL_LIMIT",
        "Today's category proposal allowance is exhausted. Please try again tomorrow.",
        429,
      );
    return { id: proposal.id };
  }
  proposal(id: string) {
    return this.db
      .prepare("SELECT * FROM category_proposals WHERE id=?")
      .bind(id)
      .first<{
        id: string;
        submitted_by: string;
        name: string;
        parent_id: string | null;
        explanation: string;
        proposed_data: string;
        status: string;
        resolution_note: string | null;
        resolved_category_id: string | null;
        updated_at: number;
        created_at: number;
      }>();
  }
  resolveProposalStatement(
    id: string,
    status: "accepted" | "aliased" | "rejected",
    actorId: string,
    note: string,
    categoryId: string | null,
    now: number,
    fence: DecisionGuard,
  ) {
    return this.db
      .prepare(
        `UPDATE category_proposals SET status=?,resolved_by=?,resolution_note=?,resolved_category_id=?,resolved_at=?,updated_at=? WHERE id=? AND status='pending' AND ${fence.sql}`,
      )
      .bind(status, actorId, note, categoryId, now, now, id, ...fence.values);
  }

  // ---- Transfer merges ------------------------------------------------------
  merge(id: string) {
    return this.db
      .prepare("SELECT * FROM category_merges WHERE id=?")
      .bind(id)
      .first<MergeRecord>();
  }
  /** Active merges a new merge or a reversal must not overlap. */
  /** Whether either category has unreversed edits made after a time. */
  async laterEdits(donorId: string, survivorId: string, after: number) {
    return Boolean(
      await this.db
        .prepare(
          "SELECT 1 FROM moderation_actions WHERE kind='category_update' AND target_id IN (?,?) AND created_at>? AND reversed_by IS NULL LIMIT 1",
        )
        .bind(donorId, survivorId, after)
        .first(),
    );
  }
  async busyMerges(categoryIds: string[], after = 0) {
    return (
      await this.db
        .prepare(
          `SELECT id,state FROM category_merges WHERE active=1 AND created_at>? AND (donor_id IN (SELECT value FROM json_each(?)) OR survivor_id IN (SELECT value FROM json_each(?)))`,
        )
        .bind(after, JSON.stringify(categoryIds), JSON.stringify(categoryIds))
        .all<{ id: string; state: string }>()
    ).results;
  }
  beginMergeStatements(
    merge: {
      id: string;
      donorId: string;
      survivorId: string;
      actionId: string;
    },
    now: number,
    fence: DecisionGuard,
  ) {
    return [
      this.db
        .prepare(
          `INSERT INTO category_merges(id,donor_id,survivor_id,action_id,state,active,created_at,updated_at) SELECT ?,?,?,?,'transferring',1,?,? WHERE ${fence.sql}`,
        )
        .bind(
          merge.id,
          merge.donorId,
          merge.survivorId,
          merge.actionId,
          now,
          now,
          ...fence.values,
        ),
      // Deactivating the donor freezes its ratings (formula revision trigger).
      this.db
        .prepare(
          `UPDATE categories SET is_active=0,revision=revision+1,updated_at=? WHERE id=? AND ${fence.sql}`,
        )
        .bind(now, merge.donorId, ...fence.values),
      this.db
        .prepare(
          `UPDATE categories SET revision=revision+1,updated_at=? WHERE id=? AND ${fence.sql}`,
        )
        .bind(now, merge.survivorId, ...fence.values),
    ];
  }
  /** Claims the next page; a concurrent claim with the same prior token fails. */
  private claim(merge: MergeRecord, token: string, state: string) {
    return this.db
      .prepare(
        "UPDATE category_merges SET page_token=?,updated_at=? WHERE id=? AND state=? AND page_token IS ?",
      )
      .bind(token, Date.now(), merge.id, state, merge.page_token);
  }
  private owned(mergeId: string, token: string) {
    return {
      sql: "EXISTS(SELECT 1 FROM category_merges WHERE id=? AND page_token=?)",
      values: [mergeId, token],
    };
  }
  private ledger(
    mergeId: string,
    type: "rating" | "membership" | "comment",
    entityId: string,
    role: string,
    now: number,
    extra: {
      productId?: string;
      partnerId?: string;
      priorCounted?: number | null;
      priorEligible?: number | null;
    } = {},
  ) {
    return [
      mergeId,
      type,
      entityId,
      extra.productId ?? null,
      role,
      extra.partnerId ?? null,
      extra.priorCounted ?? null,
      extra.priorEligible ?? null,
      now,
    ];
  }
  /**
   * Transfers one bounded page of donor ratings. Each move is recorded with
   * its prior values in the same batch, guarded by the page token, so a page
   * either commits completely or not at all.
   */
  async transferPage(merge: MergeRecord, now: number) {
    const D = merge.donor_id,
      S = merge.survivor_id;
    const rows = (
      await this.db
        .prepare(
          `SELECT r.id,r.user_id,r.product_version_id,v.product_id,r.is_counted,r.updated_at,
          s.id AS survivor_id,s.updated_at AS survivor_updated_at,s.is_counted AS survivor_counted
          FROM ratings r JOIN product_versions v ON v.id=r.product_version_id
          LEFT JOIN ratings s ON s.user_id=r.user_id AND s.product_version_id=r.product_version_id AND s.category_id=?
          WHERE r.category_id=? AND NOT EXISTS(SELECT 1 FROM category_merge_moves m WHERE m.merge_id=? AND m.entity_type='rating' AND m.entity_id=r.id)
          ORDER BY r.id LIMIT ?`,
        )
        .bind(S, D, merge.id, PAGE)
        .all<PageRating>()
    ).results;
    if (!rows.length) return { moved: 0, versions: [] as string[] };
    const token = this.newId(),
      g = this.owned(merge.id, token);
    const ledgerSql = `INSERT INTO category_merge_moves(merge_id,entity_type,entity_id,product_id,role,partner_id,prior_counted,prior_eligible,created_at)`;
    const statements: D1PreparedStatement[] = [
      this.claim(merge, token, "transferring"),
    ];
    for (const product of new Set(rows.map((r) => r.product_id)))
      statements.push(
        this.db
          .prepare(
            `${ledgerSql} SELECT ?,'membership',?,?,CASE WHEN EXISTS(SELECT 1 FROM product_categories WHERE product_id=? AND category_id=?) THEN 'membership_existing' ELSE 'membership_added' END,NULL,NULL,
            (SELECT ranking_eligible FROM product_categories WHERE product_id=? AND category_id=?),? WHERE ${g.sql} ON CONFLICT DO NOTHING`,
          )
          .bind(
            merge.id,
            product,
            product,
            product,
            S,
            product,
            D,
            now,
            ...g.values,
          ),
        this.db
          .prepare(
            `INSERT INTO product_categories(product_id,category_id,ranking_eligible,created_at,updated_at)
            SELECT ?,?,COALESCE((SELECT ranking_eligible FROM product_categories WHERE product_id=? AND category_id=?),1),?,? WHERE ${g.sql} ON CONFLICT DO NOTHING`,
          )
          .bind(product, S, product, D, now, now, ...g.values),
      );
    for (const r of rows) {
      const noSurvivor = `NOT EXISTS(SELECT 1 FROM ratings x WHERE x.user_id=? AND x.product_version_id=? AND x.category_id=?)`;
      if (!r.survivor_id) {
        statements.push(
          this.db
            .prepare(
              `${ledgerSql} SELECT ?,?,?,?,?,?,?,?,? WHERE ${noSurvivor} AND ${g.sql}`,
            )
            .bind(
              ...this.ledger(merge.id, "rating", r.id, "moved", now, {
                productId: r.product_id,
                priorCounted: r.is_counted,
              }),
              r.user_id,
              r.product_version_id,
              S,
              ...g.values,
            ),
          this.db
            .prepare(
              `UPDATE ratings SET category_id=? WHERE id=? AND category_id=? AND EXISTS(SELECT 1 FROM category_merge_moves WHERE merge_id=? AND entity_type='rating' AND entity_id=? AND role='moved') AND ${g.sql}`,
            )
            .bind(S, r.id, D, merge.id, r.id, ...g.values),
        );
        continue;
      }
      // The same user rated this formula in both categories: the most
      // recently updated rating counts; the other is retained uncounted.
      const unchanged = `EXISTS(SELECT 1 FROM ratings WHERE id=? AND updated_at=? AND category_id=?)`;
      const donorWins =
        r.is_counted === 1 &&
        r.updated_at > (r.survivor_updated_at ?? Number.MAX_SAFE_INTEGER);
      if (!donorWins) {
        statements.push(
          this.db
            .prepare(
              `${ledgerSql} SELECT ?,?,?,?,?,?,?,?,? WHERE ${unchanged} AND ${g.sql}`,
            )
            .bind(
              ...this.ledger(merge.id, "rating", r.id, "donor_loses", now, {
                productId: r.product_id,
                partnerId: r.survivor_id,
                priorCounted: r.is_counted,
              }),
              r.survivor_id,
              r.survivor_updated_at,
              S,
              ...g.values,
            ),
          this.db
            .prepare(
              `UPDATE ratings SET is_counted=0 WHERE id=? AND EXISTS(SELECT 1 FROM category_merge_moves WHERE merge_id=? AND entity_type='rating' AND entity_id=? AND role='donor_loses') AND ${g.sql}`,
            )
            .bind(r.id, merge.id, r.id, ...g.values),
        );
        continue;
      }
      const pair = `EXISTS(SELECT 1 FROM category_merge_moves WHERE merge_id=? AND entity_type='rating' AND entity_id=? AND role='survivor_loses')`;
      statements.push(
        this.db
          .prepare(
            `${ledgerSql} SELECT ?,?,?,?,?,?,?,?,? WHERE ${unchanged} AND ${g.sql}`,
          )
          .bind(
            ...this.ledger(
              merge.id,
              "rating",
              r.survivor_id,
              "survivor_loses",
              now,
              {
                productId: r.product_id,
                partnerId: r.id,
                priorCounted: r.survivor_counted,
              },
            ),
            r.survivor_id,
            r.survivor_updated_at,
            S,
            ...g.values,
          ),
        this.db
          .prepare(
            `${ledgerSql} SELECT ?,?,?,?,?,?,?,?,? WHERE ${pair} AND ${g.sql}`,
          )
          .bind(
            ...this.ledger(merge.id, "rating", r.id, "donor_wins", now, {
              productId: r.product_id,
              partnerId: r.survivor_id,
              priorCounted: r.is_counted,
            }),
            merge.id,
            r.survivor_id,
            ...g.values,
          ),
        // Swap through the system account: the unique (user, formula,
        // category) key has no free slot for a direct exchange.
        this.db
          .prepare(
            `UPDATE ratings SET user_id=? WHERE id=? AND ${pair} AND ${g.sql}`,
          )
          .bind(
            SYSTEM_ACTOR_ID,
            r.survivor_id,
            merge.id,
            r.survivor_id,
            ...g.values,
          ),
        this.db
          .prepare(
            `UPDATE ratings SET category_id=? WHERE id=? AND ${pair} AND ${g.sql}`,
          )
          .bind(S, r.id, merge.id, r.survivor_id, ...g.values),
        this.db
          .prepare(
            `UPDATE ratings SET user_id=?,category_id=?,is_counted=0 WHERE id=? AND user_id=? AND ${pair} AND ${g.sql}`,
          )
          .bind(
            r.user_id,
            D,
            r.survivor_id,
            SYSTEM_ACTOR_ID,
            merge.id,
            r.survivor_id,
            ...g.values,
          ),
      );
    }
    const versions = [...new Set(rows.map((r) => r.product_version_id))];
    // Concurrent rating writers for these formulas retry against fresh rows.
    statements.push(
      this.db
        .prepare(
          `UPDATE formula_revisions SET revision=revision+1 WHERE product_version_id IN (SELECT value FROM json_each(?)) AND ${g.sql}`,
        )
        .bind(JSON.stringify(versions), ...g.values),
    );
    const results = await this.db.batch(statements);
    if (!results[0]!.meta.changes)
      throw new ApplicationError(
        "MERGE_BUSY",
        "Another request is continuing this merge. Refresh shortly.",
        409,
      );
    return { moved: rows.length, versions };
  }
  /** Comments, remaining memberships, children, aliases and features. */
  async finalizeMerge(
    merge: MergeRecord,
    donor: CategoryRecord,
    now: number,
  ): Promise<{ versions: string[]; products: string[] }> {
    const D = merge.donor_id,
      S = merge.survivor_id;
    const [children, featured] = await this.db.batch([
      this.db.prepare("SELECT id FROM categories WHERE parent_id=?").bind(D),
      this.db
        .prepare(
          "SELECT f.category_id AS categoryId,f.position FROM category_features f JOIN countries co ON co.id=f.country_id AND co.iso2='US' WHERE f.category_id IN (?,?)",
        )
        .bind(D, S),
    ]);
    const donorFeature = (
      featured!.results as { categoryId: string; position: number }[]
    ).find((f) => f.categoryId === D);
    const survivorFeatured = featured!.results.length > (donorFeature ? 1 : 0);
    // The donor's name and every alias, each keeping its market scope, so
    // its search terms keep finding the survivor.
    const aliases = [
      { alias: donor.name, countryId: null as string | null },
      ...donor.aliases,
    ];
    const aliasIds = aliases.map(() => this.newId());
    const data: FinalizeData = {
      children: (children!.results as { id: string }[]).map((c) => c.id),
      aliasIds,
      feature: donorFeature
        ? { position: donorFeature.position, survivorFeatured }
        : null,
    };
    const token = this.newId(),
      g = this.owned(merge.id, token);
    const ledgerSql = `INSERT INTO category_merge_moves(merge_id,entity_type,entity_id,product_id,role,partner_id,prior_counted,prior_eligible,created_at)`;
    const statements: D1PreparedStatement[] = [
      this.claim(merge, token, "transferring"),
      this.db
        .prepare(
          `${ledgerSql} SELECT ?,'comment',id,product_id,'comment_moved',NULL,NULL,NULL,? FROM comments WHERE category_id=? AND ${g.sql}`,
        )
        .bind(merge.id, now, D, ...g.values),
      this.db
        .prepare(
          `UPDATE comments SET category_id=? WHERE category_id=? AND id IN (SELECT entity_id FROM category_merge_moves WHERE merge_id=? AND role='comment_moved') AND ${g.sql}`,
        )
        .bind(S, D, merge.id, ...g.values),
      // Donor products that had no ratings join the survivor too.
      this.db
        .prepare(
          `${ledgerSql} SELECT ?,'membership',pc.product_id,pc.product_id,CASE WHEN EXISTS(SELECT 1 FROM product_categories x WHERE x.product_id=pc.product_id AND x.category_id=?) THEN 'membership_existing' ELSE 'membership_added' END,NULL,NULL,pc.ranking_eligible,?
          FROM product_categories pc WHERE pc.category_id=? AND ${g.sql} ON CONFLICT DO NOTHING`,
        )
        .bind(merge.id, S, now, D, ...g.values),
      this.db
        .prepare(
          `INSERT INTO product_categories(product_id,category_id,ranking_eligible,created_at,updated_at) SELECT product_id,?,ranking_eligible,?,? FROM product_categories WHERE category_id=? AND ${g.sql} ON CONFLICT DO NOTHING`,
        )
        .bind(S, now, now, D, ...g.values),
      // Donor links without remaining (uncounted) ratings are removed.
      this.db
        .prepare(
          `${ledgerSql} SELECT ?,'membership',pc.product_id||'#donor',pc.product_id,'membership_removed',NULL,NULL,pc.ranking_eligible,? FROM product_categories pc
          WHERE pc.category_id=? AND NOT EXISTS(SELECT 1 FROM ratings r JOIN product_versions v ON v.id=r.product_version_id WHERE v.product_id=pc.product_id AND r.category_id=?) AND ${g.sql}`,
        )
        .bind(merge.id, now, D, D, ...g.values),
      this.db
        .prepare(
          `DELETE FROM product_categories WHERE category_id=? AND product_id IN (SELECT product_id FROM category_merge_moves WHERE merge_id=? AND role='membership_removed') AND ${g.sql}`,
        )
        .bind(D, merge.id, ...g.values),
      this.db
        .prepare(
          `UPDATE categories SET parent_id=?,revision=revision+1,updated_at=? WHERE parent_id=? AND id IN (SELECT value FROM json_each(?)) AND ${g.sql}`,
        )
        .bind(S, now, D, JSON.stringify(data.children), ...g.values),
      ...aliases.map((a, i) =>
        this.db
          .prepare(
            `INSERT INTO category_aliases(id,category_id,country_id,alias,created_at) SELECT ?,?,?,?,? WHERE ${g.sql} ON CONFLICT DO NOTHING`,
          )
          .bind(aliasIds[i], S, a.countryId, a.alias, now, ...g.values),
      ),
      ...(donorFeature
        ? [
            survivorFeatured
              ? this.db
                  .prepare(
                    `DELETE FROM category_features WHERE category_id=? AND ${g.sql}`,
                  )
                  .bind(D, ...g.values)
              : this.db
                  .prepare(
                    `UPDATE category_features SET category_id=?,updated_at=? WHERE category_id=? AND ${g.sql}`,
                  )
                  .bind(S, now, D, ...g.values),
          ]
        : []),
      this.db
        .prepare(
          `UPDATE category_merges SET state='complete',page_token=NULL,finalize_data=?,updated_at=? WHERE id=? AND ${g.sql}`,
        )
        .bind(JSON.stringify(data), now, merge.id, ...g.values),
      this.db
        .prepare(
          `UPDATE categories SET revision=revision+1,updated_at=? WHERE id IN (?,?) AND ${g.sql}`,
        )
        .bind(now, D, S, ...g.values),
    ];
    const results = await this.db.batch(statements);
    if (!results[0]!.meta.changes)
      throw new ApplicationError(
        "MERGE_BUSY",
        "Another request is finalizing this merge.",
        409,
      );
    return this.affected(merge.id);
  }
  async affected(mergeId: string) {
    const rows = (
      await this.db
        .prepare(
          `SELECT DISTINCT m.product_id AS productId,v.id AS versionId FROM category_merge_moves m JOIN product_versions v ON v.product_id=m.product_id WHERE m.merge_id=?`,
        )
        .bind(mergeId)
        .all<{ productId: string; versionId: string }>()
    ).results;
    return {
      versions: [...new Set(rows.map((r) => r.versionId))],
      products: [...new Set(rows.map((r) => r.productId))],
    };
  }
  beginReversalStatements(
    merge: MergeRecord,
    actionId: string,
    now: number,
    fence: DecisionGuard,
  ) {
    return [
      this.db
        .prepare(
          `UPDATE category_merges SET state='reversing',reversed_by=?,page_token=NULL,updated_at=? WHERE id=? AND state='complete' AND active=1 AND ${fence.sql}`,
        )
        .bind(actionId, now, merge.id, ...fence.values),
      // Removed donor links come back first: ratings need them to return.
      this.db
        .prepare(
          `INSERT INTO product_categories(product_id,category_id,ranking_eligible,created_at,updated_at)
          SELECT product_id,?,COALESCE(prior_eligible,1),?,? FROM category_merge_moves WHERE merge_id=? AND role='membership_removed' AND ${fence.sql} ON CONFLICT DO NOTHING`,
        )
        .bind(merge.donor_id, now, now, merge.id, ...fence.values),
    ];
  }
  /** Restores one bounded page of recorded rating and comment moves. */
  async reversePage(merge: MergeRecord, now: number) {
    const D = merge.donor_id,
      S = merge.survivor_id;
    const after = merge.page_token?.split("|")[1] ?? "";
    const rows = (
      await this.db
        .prepare(
          `SELECT m.entity_type AS type,m.entity_id AS id,m.role,m.partner_id AS partnerId,m.prior_counted AS priorCounted
          FROM category_merge_moves m WHERE m.merge_id=? AND m.entity_type IN ('rating','comment') AND m.role<>'survivor_loses' AND m.entity_id>? ORDER BY m.entity_id LIMIT ?`,
        )
        .bind(merge.id, after, PAGE)
        .all<{
          type: "rating" | "comment";
          id: string;
          role: string;
          partnerId: string | null;
          priorCounted: number | null;
        }>()
    ).results;
    if (!rows.length) return { restored: 0 };
    const token = `${this.newId()}|${rows.at(-1)!.id}`,
      g = this.owned(merge.id, token);
    const statements: D1PreparedStatement[] = [
      this.claim(merge, token, "reversing"),
    ];
    for (const r of rows) {
      if (r.type === "comment") {
        statements.push(
          this.db
            .prepare(
              `UPDATE comments SET category_id=? WHERE id=? AND category_id=? AND ${g.sql}`,
            )
            .bind(D, r.id, S, ...g.values),
        );
        continue;
      }
      if (r.role === "moved")
        statements.push(
          this.db
            .prepare(
              `UPDATE ratings SET category_id=? WHERE id=? AND category_id=? AND NOT EXISTS(SELECT 1 FROM ratings x WHERE x.user_id=ratings.user_id AND x.product_version_id=ratings.product_version_id AND x.category_id=?) AND ${g.sql}`,
            )
            .bind(D, r.id, S, D, ...g.values),
        );
      else if (r.role === "donor_loses")
        statements.push(
          this.db
            .prepare(
              `UPDATE ratings SET is_counted=? WHERE id=? AND category_id=? AND ${g.sql}`,
            )
            .bind(r.priorCounted ?? 1, r.id, D, ...g.values),
        );
      else if (r.role === "donor_wins" && r.partnerId) {
        const pair = `EXISTS(SELECT 1 FROM ratings a JOIN ratings b ON b.id=? WHERE a.id=? AND a.category_id=? AND b.category_id=?)`;
        const survivor = await this.db
          .prepare(
            "SELECT prior_counted FROM category_merge_moves WHERE merge_id=? AND entity_type='rating' AND entity_id=?",
          )
          .bind(merge.id, r.partnerId)
          .first<number>("prior_counted");
        const user = await this.db
          .prepare("SELECT user_id FROM ratings WHERE id=?")
          .bind(r.id)
          .first<string>("user_id");
        if (!user) continue;
        // Park the winner, return the survivor's rating, then restore the winner.
        statements.push(
          this.db
            .prepare(
              `UPDATE ratings SET user_id=? WHERE id=? AND ${pair} AND ${g.sql}`,
            )
            .bind(SYSTEM_ACTOR_ID, r.id, r.partnerId, r.id, S, D, ...g.values),
          this.db
            .prepare(
              `UPDATE ratings SET category_id=?,is_counted=? WHERE id=? AND category_id=? AND EXISTS(SELECT 1 FROM ratings WHERE id=? AND user_id=?) AND ${g.sql}`,
            )
            .bind(
              S,
              survivor ?? 1,
              r.partnerId,
              D,
              r.id,
              SYSTEM_ACTOR_ID,
              ...g.values,
            ),
          this.db
            .prepare(
              `UPDATE ratings SET user_id=?,category_id=?,is_counted=? WHERE id=? AND user_id=? AND ${g.sql}`,
            )
            .bind(
              user,
              D,
              r.priorCounted ?? 1,
              r.id,
              SYSTEM_ACTOR_ID,
              ...g.values,
            ),
        );
      }
    }
    const results = await this.db.batch(statements);
    if (!results[0]!.meta.changes)
      throw new ApplicationError(
        "MERGE_BUSY",
        "Another request is reversing this merge.",
        409,
      );
    return { restored: rows.length };
  }
  async finishReversal(merge: MergeRecord, now: number) {
    const D = merge.donor_id,
      S = merge.survivor_id;
    const data = JSON.parse(
      merge.finalize_data ?? "{}",
    ) as Partial<FinalizeData>;
    const token = this.newId(),
      g = this.owned(merge.id, token);
    const statements: D1PreparedStatement[] = [
      this.claim(merge, token, "reversing"),
      // Survivor links the merge created go away unless later ratings use them.
      this.db
        .prepare(
          `DELETE FROM product_categories WHERE category_id=? AND product_id IN (SELECT product_id FROM category_merge_moves WHERE merge_id=? AND role='membership_added')
          AND NOT EXISTS(SELECT 1 FROM ratings r JOIN product_versions v ON v.id=r.product_version_id WHERE v.product_id=product_categories.product_id AND r.category_id=?) AND ${g.sql}`,
        )
        .bind(S, merge.id, S, ...g.values),
      this.db
        .prepare(
          `UPDATE categories SET parent_id=?,revision=revision+1,updated_at=? WHERE parent_id=? AND id IN (SELECT value FROM json_each(?)) AND ${g.sql}`,
        )
        .bind(D, now, S, JSON.stringify(data.children ?? []), ...g.values),
      this.db
        .prepare(
          `DELETE FROM category_aliases WHERE id IN (SELECT value FROM json_each(?)) AND ${g.sql}`,
        )
        .bind(JSON.stringify(data.aliasIds ?? []), ...g.values),
      ...(data.feature
        ? [
            data.feature.survivorFeatured
              ? this.db
                  .prepare(
                    `INSERT INTO category_features(country_id,category_id,position,updated_at) SELECT id,?,?,? FROM countries WHERE iso2='US' AND ${g.sql} ON CONFLICT DO NOTHING`,
                  )
                  .bind(D, data.feature.position, now, ...g.values)
              : this.db
                  .prepare(
                    `UPDATE category_features SET category_id=?,updated_at=? WHERE category_id=? AND position=? AND ${g.sql}`,
                  )
                  .bind(D, now, S, data.feature.position, ...g.values),
          ]
        : []),
      this.db
        .prepare(
          `UPDATE categories SET is_active=1,revision=revision+1,updated_at=? WHERE id=? AND ${g.sql}`,
        )
        .bind(now, D, ...g.values),
      this.db
        .prepare(
          `UPDATE categories SET revision=revision+1,updated_at=? WHERE id=? AND ${g.sql}`,
        )
        .bind(now, S, ...g.values),
      this.db
        .prepare(
          `UPDATE category_merges SET state='reversed',active=0,page_token=NULL,updated_at=? WHERE id=? AND ${g.sql}`,
        )
        .bind(now, merge.id, ...g.values),
    ];
    const results = await this.db.batch(statements);
    if (!results[0]!.meta.changes)
      throw new ApplicationError(
        "MERGE_BUSY",
        "Another request is reversing this merge.",
        409,
      );
    return this.affected(merge.id);
  }
}
