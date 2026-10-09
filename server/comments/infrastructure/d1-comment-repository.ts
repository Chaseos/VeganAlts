import { ApplicationError } from "../../shared/domain/errors";
import {
  replay,
  type ReceiptWrite,
} from "../../community/infrastructure/receipts";
import {
  COMMENT_PAGE,
  commentDay,
  encodeCommentCursor,
  isCollapsed,
  type CommentFormula,
  type CommentPolicy,
  type CommentSort,
  type CommentState,
  decodeCommentCursor,
} from "../domain/comments";

export interface CommentProduct {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  versionId: string;
  categories: { id: string; name: string }[];
}
export interface CommentRow {
  id: string;
  user_id: string;
  product_id: string;
  product_version_id: string;
  category_id: string | null;
  body: string;
  moderation_state: CommentState;
  up_count: number;
  down_count: number;
  best_rank: number;
  vote_revision: number;
  edited_at: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}
export interface PublicComment {
  id: string;
  body: string;
  author: { handle: string; displayName: string | null };
  formula: { id: string; label: string; isCurrent: boolean };
  category: { id: string; name: string } | null;
  upvotes: number;
  downvotes: number;
  collapsed: boolean;
  createdAt: number;
  editedAt: number | null;
}

const visible = "c.moderation_state='visible' AND c.deleted_at IS NULL";
const publicFields = `c.id,c.body,c.up_count AS upvotes,c.down_count AS downvotes,c.best_rank AS bestRank,c.created_at AS createdAt,c.edited_at AS editedAt,
  pr.handle,pr.display_name AS displayName,v.id AS formulaId,COALESCE(v.version_label,'Original formula') AS formulaLabel,v.is_current AS isCurrent,
  cat.id AS categoryId,cat.name AS categoryName`;
const publicJoins = `JOIN profiles pr ON pr.user_id=c.user_id AND pr.account_state='active'
  JOIN product_versions v ON v.id=c.product_version_id
  LEFT JOIN categories cat ON cat.id=c.category_id`;

export class D1CommentRepository {
  constructor(
    private readonly db: D1Database,
    private readonly policy: CommentPolicy,
  ) {}
  replay<T>(receipt: ReceiptWrite) {
    return replay<T>(this.db, receipt);
  }
  /** A visible US product's current formula, which new comments describe. */
  async product(where: { id?: string; slug?: string }) {
    const row = await this.db
      .prepare(
        `SELECT p.id,p.slug,p.name,b.name AS brand,v.id AS versionId,
        (SELECT json_group_array(json_object('id',c.id,'name',c.name)) FROM product_categories pc JOIN categories c ON c.id=pc.category_id WHERE pc.product_id=p.id AND c.is_active=1) AS categories
        FROM products p JOIN countries co ON co.id=p.country_id AND co.iso2='US' AND co.is_active=1
        JOIN product_versions v ON v.product_id=p.id AND v.is_current=1
        LEFT JOIN brands b ON b.id=p.brand_id
        WHERE ${where.id ? "p.id=?" : "p.slug=?"} AND p.lifecycle_status<>'hidden'`,
      )
      .bind(where.id ?? where.slug)
      .first<Omit<CommentProduct, "categories"> & { categories: string }>();
    if (!row) return null;
    return {
      ...row,
      categories: JSON.parse(row.categories) as CommentProduct["categories"],
    };
  }
  get(id: string) {
    return this.db
      .prepare("SELECT * FROM comments WHERE id=?")
      .bind(id)
      .first<CommentRow>();
  }
  async page(
    product: CommentProduct,
    sort: CommentSort,
    formula: CommentFormula,
    rawCursor: string | null,
  ) {
    const cursor = decodeCommentCursor(rawCursor, sort);
    const scope =
      formula === "current"
        ? "c.product_version_id=?"
        : "c.product_id=? AND c.product_version_id<>?";
    const scopeParams =
      formula === "current"
        ? [product.versionId]
        : [product.id, product.versionId];
    const order =
      sort === "best"
        ? "c.best_rank DESC,c.created_at DESC,c.id DESC"
        : "c.created_at DESC,c.id DESC";
    const after = !cursor
      ? ""
      : cursor.sort === "best"
        ? "AND (c.best_rank,c.created_at,c.id)<(?,?,?)"
        : "AND (c.created_at,c.id)<(?,?)";
    const afterParams = !cursor
      ? []
      : cursor.sort === "best"
        ? [cursor.rank, cursor.createdAt, cursor.id]
        : [cursor.createdAt, cursor.id];
    const rows = (
      await this.db
        .prepare(
          `SELECT ${publicFields} FROM comments c ${publicJoins} WHERE ${scope} AND ${visible} ${after} ORDER BY ${order} LIMIT ?`,
        )
        .bind(...scopeParams, ...afterParams, COMMENT_PAGE + 1)
        .all<{
          id: string;
          body: string;
          upvotes: number;
          downvotes: number;
          bestRank: number;
          createdAt: number;
          editedAt: number | null;
          handle: string;
          displayName: string | null;
          formulaId: string;
          formulaLabel: string;
          isCurrent: number;
          categoryId: string | null;
          categoryName: string | null;
        }>()
    ).results;
    const more = rows.length > COMMENT_PAGE,
      shown = rows.slice(0, COMMENT_PAGE),
      last = shown.at(-1);
    return {
      comments: shown.map((r): PublicComment => ({
        id: r.id,
        body: r.body,
        author: { handle: r.handle, displayName: r.displayName },
        formula: {
          id: r.formulaId,
          label: r.formulaLabel,
          isCurrent: r.isCurrent === 1,
        },
        category:
          r.categoryId && r.categoryName
            ? { id: r.categoryId, name: r.categoryName }
            : null,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        collapsed: isCollapsed(r.upvotes, r.downvotes, this.policy),
        createdAt: r.createdAt,
        editedAt: r.editedAt,
      })),
      nextCursor:
        more && last
          ? encodeCommentCursor(
              sort === "best"
                ? {
                    sort,
                    rank: last.bestRank,
                    createdAt: last.createdAt,
                    id: last.id,
                  }
                : { sort, createdAt: last.createdAt, id: last.id },
            )
          : null,
    };
  }
  async counts(product: CommentProduct) {
    const row = await this.db
      .prepare(
        `SELECT COALESCE(SUM(c.product_version_id=?),0) AS current,COALESCE(SUM(c.product_version_id<>?),0) AS earlier
        FROM comments c JOIN profiles pr ON pr.user_id=c.user_id AND pr.account_state='active' WHERE c.product_id=? AND ${visible}`,
      )
      .bind(product.versionId, product.versionId, product.id)
      .first<{ current: number; earlier: number }>();
    return { current: row?.current ?? 0, earlier: row?.earlier ?? 0 };
  }
  /** Recent other contributors' text, given to duplicate detection only. */
  async recentBodies(productId: string, excludeUserId: string) {
    return (
      await this.db
        .prepare(
          `SELECT c.body FROM comments c WHERE c.product_id=? AND c.user_id<>? AND ${visible} ORDER BY c.created_at DESC LIMIT 5`,
        )
        .bind(productId, excludeUserId)
        .all<{ body: string }>()
    ).results.map((r) => r.body.slice(0, 500));
  }
  async duplicate(userId: string, productId: string, body: string) {
    return Boolean(
      await this.db
        .prepare(
          "SELECT 1 FROM comments WHERE user_id=? AND product_id=? AND body=? AND deleted_at IS NULL AND moderation_state<>'removed' LIMIT 1",
        )
        .bind(userId, productId, body)
        .first(),
    );
  }
  async create(
    comment: {
      id: string;
      userId: string;
      product: CommentProduct;
      categoryId: string | null;
      body: string;
      state: "visible" | "pending";
      decisionId: string | null;
      now: number;
    },
    receipt: ReceiptWrite,
    result: unknown,
  ) {
    const insert = await this.db
      .batch([
        this.db
          .prepare(
            `INSERT INTO comments(id,user_id,product_id,product_version_id,category_id,body,moderation_state,decision_id,created_at,updated_at)
          SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')
          AND (SELECT COUNT(*) FROM comments WHERE user_id=? AND created_at>=?) < ?
          AND EXISTS(SELECT 1 FROM product_versions WHERE id=? AND product_id=? AND is_current=1)`,
          )
          .bind(
            comment.id,
            comment.userId,
            comment.product.id,
            comment.product.versionId,
            comment.categoryId,
            comment.body,
            comment.state,
            comment.decisionId,
            comment.now,
            comment.now,
            comment.userId,
            comment.userId,
            commentDay(comment.now),
            this.policy.perDay,
            comment.product.versionId,
            comment.product.id,
          ),
        // The receipt exists only if the comment was inserted, so a quota
        // refusal can be retried with the same key.
        this.db
          .prepare(
            "INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM comments WHERE id=?)",
          )
          .bind(
            receipt.userId,
            receipt.operation,
            receipt.key,
            receipt.hash,
            JSON.stringify(result),
            receipt.now,
            comment.id,
          ),
      ])
      .catch(async (error: unknown) => {
        const saved = await this.replay(receipt);
        if (saved) return null;
        throw error;
      });
    if (insert && !insert[0]!.meta.changes) {
      throw new ApplicationError(
        "COMMENT_LIMIT",
        "Today's comment allowance is exhausted, or this formula changed. Refresh and try again tomorrow.",
        429,
      );
    }
  }
  async edit(
    id: string,
    userId: string,
    expectedUpdatedAt: number,
    body: string,
    state: "visible" | "pending",
    decisionId: string | null,
    now: number,
  ) {
    const result = await this.db
      .prepare(
        "UPDATE comments SET body=?,moderation_state=?,decision_id=?,edited_at=?,updated_at=max(updated_at+1,?) WHERE id=? AND user_id=? AND updated_at=? AND deleted_at IS NULL AND moderation_state IN ('visible','pending')",
      )
      .bind(body, state, decisionId, now, now, id, userId, expectedUpdatedAt)
      .run();
    return result.meta.changes === 1;
  }
  async remove(id: string, userId: string, now: number) {
    const result = await this.db
      .prepare(
        "UPDATE comments SET deleted_at=?,updated_at=max(updated_at+1,?) WHERE id=? AND user_id=? AND deleted_at IS NULL",
      )
      .bind(now, now, id, userId)
      .run();
    return result.meta.changes === 1;
  }
  async vote(
    commentId: string,
    userId: string,
    value: -1 | 0 | 1,
    next: { up: number; down: number; rank: number },
    revision: number,
    token: string,
    now: number,
  ) {
    // One fenced batch: counts and the voter's row change together or not at
    // all. The row change is guarded on this attempt's unique token, never on
    // a revision number another voter's update could also produce.
    const fenced = "EXISTS(SELECT 1 FROM comments WHERE id=? AND vote_token=?)";
    const result = await this.db.batch([
      this.db
        .prepare(
          `UPDATE comments SET up_count=?,down_count=?,best_rank=?,vote_revision=vote_revision+1,vote_token=?
          WHERE id=? AND vote_revision=? AND moderation_state='visible' AND deleted_at IS NULL AND user_id<>?
          AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')`,
        )
        .bind(
          next.up,
          next.down,
          next.rank,
          token,
          commentId,
          revision,
          userId,
          userId,
        ),
      value === 0
        ? this.db
            .prepare(
              `DELETE FROM comment_votes WHERE comment_id=? AND user_id=? AND ${fenced}`,
            )
            .bind(commentId, userId, commentId, token)
        : this.db
            .prepare(
              `INSERT INTO comment_votes(comment_id,user_id,value,created_at,updated_at) SELECT ?,?,?,?,? WHERE ${fenced}
              ON CONFLICT(comment_id,user_id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
            )
            .bind(commentId, userId, value, now, now, commentId, token),
    ]);
    return result[0]!.meta.changes === 1;
  }
  async currentVote(commentId: string, userId: string) {
    const row = await this.db
      .prepare(
        "SELECT value FROM comment_votes WHERE comment_id=? AND user_id=?",
      )
      .bind(commentId, userId)
      .first<{ value: -1 | 1 }>();
    return row?.value ?? null;
  }
  /**
   * The viewer's votes and own comments for one product: every listed
   * (displayed) comment, plus their 500 latest votes and 50 latest comments
   * so held and just-posted comments appear without being listed.
   */
  async personal(productId: string, userId: string, ids: string[] = []) {
    const listed = JSON.stringify(ids);
    const [votes, own] = await this.db.batch([
      this.db
        .prepare(
          `SELECT v.comment_id AS commentId,v.value FROM comment_votes v JOIN comments c ON c.id=v.comment_id
          WHERE c.product_id=? AND v.user_id=? AND (v.comment_id IN (SELECT value FROM json_each(?))
            OR v.comment_id IN (SELECT x.comment_id FROM comment_votes x JOIN comments y ON y.id=x.comment_id WHERE y.product_id=? AND x.user_id=? ORDER BY x.updated_at DESC LIMIT 500))`,
        )
        .bind(productId, userId, listed, productId, userId),
      this.db
        .prepare(
          `SELECT c.id,c.body,c.moderation_state AS state,c.updated_at AS updatedAt,c.created_at AS createdAt,c.edited_at AS editedAt FROM comments c
          WHERE c.product_id=? AND c.user_id=? AND c.deleted_at IS NULL AND (c.id IN (SELECT value FROM json_each(?))
            OR c.id IN (SELECT id FROM comments WHERE product_id=? AND user_id=? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 50))
          ORDER BY c.created_at DESC`,
        )
        .bind(productId, userId, listed, productId, userId),
    ]);
    return {
      votes: Object.fromEntries(
        (votes!.results as { commentId: string; value: number }[]).map((v) => [
          v.commentId,
          v.value,
        ]),
      ),
      own: own!.results as {
        id: string;
        body: string;
        state: CommentState;
        updatedAt: number;
        createdAt: number;
        editedAt: number | null;
      }[],
    };
  }
  /** Held comments awaiting a provider recovery, oldest first. */
  async held(limit: number) {
    return (
      await this.db
        .prepare(
          `SELECT c.* FROM comments c WHERE c.moderation_state='pending' AND c.deleted_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM moderation_decisions d WHERE d.subject_type='comment' AND d.subject_id=c.id AND d.status IN ('completed','reused') AND d.created_at>=c.updated_at)
          ORDER BY c.created_at LIMIT ?`,
        )
        .bind(limit)
        .all<CommentRow>()
    ).results;
  }
  async release(id: string, updatedAt: number, decisionId: string) {
    await this.db
      .prepare(
        "UPDATE comments SET moderation_state='visible',decision_id=? WHERE id=? AND moderation_state='pending' AND updated_at=?",
      )
      .bind(decisionId, id, updatedAt)
      .run();
  }
}
