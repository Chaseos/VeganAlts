import { ApplicationError } from "../../shared/domain/errors";
import { taxonomyShape } from "../domain/shape";
import type { Actor } from "../../community/domain/contracts";
import { administrator, active } from "../../community/domain/policy";
import { receiptWrite } from "../../community/infrastructure/receipts";
import type { ActionWrite } from "../../community/infrastructure/moderation-repository";
import type { ModerationDecisionService } from "../../moderation/application/decision-service";
import {
  assertCategorySlug,
  categoryDecision,
  categoryKey,
  categoryProposalInput,
  storedCategoryProposal,
  categorySlug,
  createCategoryInput,
  dimensionsInput,
  featuresInput,
  MAX_ACTIVE_DIMENSIONS,
  mergeInput,
  planCategoryUpdate,
  updateCategoryInput,
  sortAliases,
  type CategoryPatch,
  type CategoryState,
  type DimensionState,
} from "../domain/taxonomy";
import type {
  CategoryRecord,
  D1TaxonomyRepository,
  MergeRecord,
} from "../infrastructure/d1-taxonomy-repository";

/** Side effects after a committed taxonomy change: derived data and caches. */
export interface TaxonomyEffects {
  rebuildVersions(versionIds: string[]): Promise<void>;
  rebuildSearch(): Promise<void>;
  refreshTrending(categoryIds: string[]): Promise<void>;
  invalidate(categorySlugs: string[], productIds: string[]): Promise<void>;
}
const PROPOSALS_PER_DAY = 3;
// Every featured category is still active (bound: IDs as JSON, their count).
// The insert skips inactive ones, so this keeps the audit equal to the rows.
const FEATURABLE =
  "(SELECT COUNT(*) FROM categories WHERE id IN (SELECT value FROM json_each(?)) AND is_active=1)=?";
// Unreversed edits to either category made after a merge (donor, survivor,
// merge time).
const LATER_EDITS =
  "EXISTS(SELECT 1 FROM moderation_actions WHERE kind='category_update' AND target_id IN (?,?) AND created_at>? AND reversed_by IS NULL)";
/**
 * Fences a parent checked before a commit: it is still active and, for an
 * existing category, does not descend from it (no concurrent cycle).
 */
function fenceParent(
  guard: { sql: string; values: unknown[] },
  categoryId: string | null,
  parentId: string | null | undefined,
) {
  if (!parentId) return;
  guard.sql +=
    " AND EXISTS(SELECT 1 FROM categories WHERE id=? AND is_active=1) AND NOT EXISTS(WITH RECURSIVE up(id) AS (SELECT ? UNION SELECT c.parent_id FROM categories c JOIN up ON c.id=up.id WHERE c.parent_id IS NOT NULL) SELECT 1 FROM up WHERE id=?)";
  guard.values.push(parentId, parentId, categoryId);
}
/**
 * Who a category's name must differ from. Foods (rankable) share one namespace
 * with every food name and alias; an aisle or shelf only needs a name unique
 * among its siblings, so the Eggs aisle can hold an Eggs shelf and food.
 */
export type NameScope =
  { rankable: true } | { rankable: false; parentId: string | null };
export const scopeFor = (
  isRankable: boolean,
  parentId: string | null,
): NameScope =>
  isRankable ? { rankable: true } : { rankable: false, parentId };
/**
 * Fences names checked before a commit: no other category may have claimed
 * one of them meanwhile in the same scope (an exact, case-insensitive match).
 */
function fenceNames(
  guard: { sql: string; values: unknown[] },
  names: string[],
  except: string,
  scope: NameScope,
) {
  if (!names.length) return;
  const list = JSON.stringify(names);
  if (scope.rankable) {
    guard.sql +=
      " AND NOT EXISTS(SELECT 1 FROM categories WHERE id<>? AND is_rankable=1 AND name COLLATE NOCASE IN (SELECT value FROM json_each(?))) AND NOT EXISTS(SELECT 1 FROM category_aliases WHERE category_id<>? AND alias COLLATE NOCASE IN (SELECT value FROM json_each(?)))";
    guard.values.push(except, list, except, list);
  } else {
    guard.sql +=
      " AND NOT EXISTS(SELECT 1 FROM categories WHERE id<>? AND parent_id IS ? AND name COLLATE NOCASE IN (SELECT value FROM json_each(?)))";
    guard.values.push(except, scope.parentId, list);
  }
}
// Bounded work per request; the hourly automation and "continue" finish the rest.
const PAGES_PER_REQUEST = 4;

export class TaxonomyService {
  constructor(
    private readonly repository: D1TaxonomyRepository,
    private readonly decisions: ModerationDecisionService,
    private readonly effects: TaxonomyEffects,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}
  async tree(actor: Actor) {
    administrator(actor);
    const tree = await this.repository.tree();
    // Depth is derived, never stored; a rankable food outside depth three is
    // reachable by URL and search but missing from the aisle bar.
    const shape = taxonomyShape(
      tree.categories
        .filter((c) => c.isActive)
        .map((c) => ({ ...c, isRankable: c.isRankable })),
    );
    return {
      ...tree,
      categories: tree.categories.map((c) => ({
        ...c,
        depth: shape.get(c.id)?.depth ?? null,
        outsideDepth: shape.get(c.id)?.outsideDepth ?? false,
      })),
    };
  }
  redirect(slug: string) {
    return this.repository.redirect(slug);
  }
  private async existing(id: string) {
    const category = await this.repository.category(id);
    if (!category)
      throw new ApplicationError("NOT_FOUND", "Category not found.", 404);
    return category;
  }
  private async assertNameAvailable(
    names: string[],
    scope: NameScope,
    except?: string,
  ) {
    const keys = new Set(names.map(categoryKey));
    const taken = (await this.repository.names()).find(
      (n) =>
        n.id !== except &&
        keys.has(categoryKey(n.value)) &&
        (scope.rankable
          ? n.isAlias === 1 || n.rankable === 1
          : n.isAlias === 0 && n.parentId === scope.parentId),
    );
    if (taken)
      throw new ApplicationError(
        "CATEGORY_EXISTS",
        scope.rankable
          ? `“${taken.value}” already names a food${taken.active ? "" : " (retired)"}. Use or alias the existing food.`
          : `“${taken.value}” already names a group here${taken.active ? "" : " (retired)"}. Choose another name.`,
        409,
      );
  }
  // Aisles and shelves are navigation, not search targets: no aliases.
  private assertGroupAliases(isRankable: boolean, aliases: unknown[]) {
    if (!isRankable && aliases.length)
      throw new ApplicationError(
        "GROUP_ALIASES",
        "Aisles and shelves take no aliases or search terms. Add them to a food.",
      );
  }
  // Category proposals choose a shelf: an active group two levels below Food.
  private async assertShelf(parentId: string) {
    const parent = await this.existing(parentId);
    const ancestors = await this.repository.ancestors(parentId);
    if (!parent.isActive || parent.isRankable || ancestors.length !== 2)
      throw new ApplicationError(
        "INVALID_SHELF",
        "Choose the shelf the new food belongs on.",
      );
  }
  private async assertSlugAvailable(slug: string, owner?: string) {
    assertCategorySlug(slug);
    const current = await this.repository.slugOwner(slug);
    if (current && current !== owner)
      throw new ApplicationError(
        "SLUG_TAKEN",
        "Another category uses or redirects from that address.",
        409,
      );
  }
  private async assertParent(id: string | null, parentId: string | null) {
    if (!parentId) return;
    const parent = await this.existing(parentId);
    if (!parent.isActive)
      throw new ApplicationError(
        "INVALID_PARENT",
        "Choose an active parent category.",
      );
    if (
      id &&
      (parentId === id ||
        (await this.repository.ancestors(parentId)).includes(id))
    )
      throw new ApplicationError(
        "INVALID_PARENT",
        "A category cannot be placed beneath itself.",
      );
  }
  private action(
    actor: Actor,
    kind: string,
    targetId: string,
    note: string,
    before: unknown,
    after: unknown,
  ): ActionWrite {
    return {
      id: this.newId(),
      actor,
      kind,
      targetId,
      productId: null,
      before,
      after,
      note,
      now: this.clock(),
    };
  }
  private async refreshed(
    slugs: string[],
    versionIds: string[] = [],
    productIds: string[] = [],
  ) {
    await this.effects.rebuildSearch();
    if (versionIds.length) await this.effects.rebuildVersions(versionIds);
    await this.effects.invalidate(slugs, productIds);
  }

  // ---- Contributor proposals ----------------------------------------------
  async propose(actor: Actor, key: string, raw: unknown) {
    active(actor);
    const input = categoryProposalInput.parse(raw);
    const receipt = await receiptWrite(
      actor.id,
      "category-proposal",
      key,
      input,
      this.clock(),
    );
    const prior = await this.repository.replay<{ id: string }>(receipt);
    if (prior) return prior;
    const slug = categorySlug(input.name);
    assertCategorySlug(slug);
    // Deterministic quota and duplicate checks before any model call; the
    // insert enforces the quota again.
    const day = Math.floor(receipt.now / 86_400_000) * 86_400_000;
    if (
      (await this.repository.proposalsSince(actor.id, day)) >= PROPOSALS_PER_DAY
    )
      throw new ApplicationError(
        "PROPOSAL_LIMIT",
        "Today's category proposal allowance is exhausted. Please try again tomorrow.",
        429,
      );
    await this.assertNameAvailable([input.name, ...input.aliases], {
      rankable: true,
    });
    await this.assertShelf(input.shelfId);
    const id = this.newId();
    const automated = await this.decisions.evaluate({
      kind: "category_proposal",
      subject: { type: "category_proposal", id },
      userId: actor.id,
      state: {
        proposal: {
          name: input.name,
          explanation: input.explanation,
          aliases: input.aliases,
          exampleProducts: input.exampleProducts,
        },
      },
    });
    if (
      automated.outcome === "BLOCKED" ||
      automated.outcome === "NEEDS_CHANGES"
    )
      throw new ApplicationError(
        automated.outcome === "BLOCKED"
          ? "PROPOSAL_BLOCKED"
          : "PROPOSAL_NEEDS_CHANGES",
        automated.reasons.join(" ") || "Check the proposed category.",
        422,
      );
    return this.repository.createProposal(
      {
        id,
        userId: actor.id,
        name: input.name,
        parentId: input.shelfId,
        country: input.country,
        explanation: input.explanation,
        data: input,
        perDay: PROPOSALS_PER_DAY,
      },
      receipt,
    );
  }
  async proposalDetail(actor: Actor, id: string) {
    active(actor);
    const proposal = await this.repository.proposal(id);
    if (
      !proposal ||
      (!actor.administrator && proposal.submitted_by !== actor.id)
    )
      throw new ApplicationError("NOT_FOUND", "Proposal not found.", 404);
    return {
      kind: "category" as const,
      id,
      status: proposal.status,
      revision: proposal.updated_at,
      proposed: JSON.parse(proposal.proposed_data) as Record<string, unknown>,
      resolutionNote: proposal.resolution_note,
      suggestedSlug: categorySlug(proposal.name),
      parentId: proposal.parent_id,
    };
  }
  /** Operator decision: create the category, alias an existing one, or reject. */
  async decideProposal(actor: Actor, key: string, id: string, raw: unknown) {
    administrator(actor);
    const input = categoryDecision.parse(raw);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        "category-decision",
        key,
        { id, ...input },
        now,
      );
    const prior = await this.repository.replay<{ actionId: string }>(receipt);
    if (prior) return prior;
    const proposal = await this.repository.proposal(id);
    if (!proposal)
      throw new ApplicationError("NOT_FOUND", "Proposal not found.", 404);
    if (
      proposal.status !== "pending" ||
      proposal.updated_at !== input.expectedRevision
    )
      throw new ApplicationError(
        "STALE_DECISION",
        "This proposal changed. Refresh before deciding.",
        409,
      );
    const data = storedCategoryProposal.parse(
      JSON.parse(proposal.proposed_data),
    );
    const guard = {
      sql: "EXISTS(SELECT 1 FROM category_proposals WHERE id=? AND status='pending' AND updated_at=?)",
      values: [id, proposal.updated_at] as (string | number | null)[],
    };
    if (input.decision === "reject") {
      const action = this.action(
        actor,
        "category_proposal_reject",
        id,
        input.note,
        { proposal },
        { status: "rejected" },
      );
      return this.repository.commit(
        action,
        guard,
        (fence) => [
          this.repository.resolveProposalStatement(
            id,
            "rejected",
            actor.id,
            input.note,
            null,
            now,
            fence,
          ),
        ],
        receipt,
      );
    }
    if (input.decision === "alias") {
      if (!input.aliasOf)
        throw new ApplicationError(
          "INVALID_DECISION",
          "Choose the category that receives this name.",
        );
      const target = await this.existing(input.aliasOf);
      if (!target.isRankable)
        throw new ApplicationError(
          "INVALID_DECISION",
          "Aliases belong to foods, not aisles or shelves.",
        );
      const held = new Set(
        [target.name, ...target.aliases.map((a) => a.alias)].map(categoryKey),
      );
      const claimed = [data.name, ...data.aliases].filter(
        (alias) => !held.has(categoryKey(alias)),
      );
      // Another category may have claimed a proposed name since submission.
      await this.assertNameAvailable(claimed, { rankable: true }, target.id);
      fenceNames(guard, claimed, target.id, { rankable: true });
      const aliases = [
        ...target.aliases,
        { alias: data.name, countryId: null, displayName: false },
        ...data.aliases.map((alias) => ({
          alias,
          countryId: null,
          displayName: false,
        })),
      ];
      const deduped = aliases.filter(
        (a, i) =>
          aliases.findIndex(
            (b) =>
              categoryKey(b.alias) === categoryKey(a.alias) &&
              b.countryId === a.countryId,
          ) === i && categoryKey(a.alias) !== categoryKey(target.name),
      );
      const plan = planCategoryUpdate(target, { aliases: deduped });
      const action = this.action(
        actor,
        "category_update",
        target.id,
        input.note,
        plan.before,
        plan.after,
      );
      guard.sql +=
        " AND EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=?)";
      guard.values.push(target.id, target.revision);
      const result = await this.repository.commit(
        action,
        guard,
        (fence) => [
          ...this.repository.categoryStatements(
            target.id,
            target,
            plan.after,
            now,
            fence,
          ),
          this.repository.resolveProposalStatement(
            id,
            "aliased",
            actor.id,
            input.note,
            target.id,
            now,
            fence,
          ),
        ],
        receipt,
      );
      await this.refreshed([target.slug]);
      return result;
    }
    const slug = input.slug
      ? categorySlug(input.slug)
      : categorySlug(data.name);
    await this.assertSlugAvailable(slug);
    const categoryId = this.newId();
    const parentId =
      input.parentId === undefined
        ? (proposal.parent_id ?? null)
        : input.parentId;
    const scope = scopeFor(input.isRankable, parentId);
    this.assertGroupAliases(input.isRankable, data.aliases);
    await this.assertNameAvailable([data.name, ...data.aliases], scope);
    fenceNames(guard, [data.name, ...data.aliases], categoryId, scope);
    await this.assertParent(null, parentId);
    fenceParent(guard, null, parentId);
    const created = {
      name: data.name,
      slug,
      parentId,
      isRankable: input.isRankable,
      aliases: data.aliases,
    };
    const action = this.action(
      actor,
      "category_create",
      categoryId,
      input.note,
      {},
      created,
    );
    const result = await this.repository.commit(
      action,
      guard,
      (fence) => [
        ...this.repository.createStatements(categoryId, created, now, fence),
        this.repository.resolveProposalStatement(
          id,
          "accepted",
          actor.id,
          input.note,
          categoryId,
          now,
          fence,
        ),
      ],
      receipt,
    );
    await this.refreshed([slug]);
    return { ...result, categoryId, slug };
  }

  // ---- Operator taxonomy management --------------------------------------
  async create(actor: Actor, key: string, raw: unknown) {
    administrator(actor);
    const input = createCategoryInput.parse(raw);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        "category-create",
        key,
        input,
        now,
      );
    const prior = await this.repository.replay<{ actionId: string }>(receipt);
    if (prior) return this.createdReplay(prior.actionId);
    const slug = categorySlug(input.slug || input.name);
    await this.assertSlugAvailable(slug);
    const scope = scopeFor(input.isRankable, input.parentId);
    this.assertGroupAliases(input.isRankable, input.aliases);
    await this.assertNameAvailable([input.name, ...input.aliases], scope);
    await this.assertParent(null, input.parentId);
    const id = this.newId();
    const created = {
      name: input.name,
      slug,
      parentId: input.parentId,
      isRankable: input.isRankable,
      aliases: input.aliases,
    };
    const guard = { sql: "1", values: [] as (string | number | null)[] };
    fenceNames(guard, [input.name, ...input.aliases], id, scope);
    fenceParent(guard, null, input.parentId);
    const result = await this.repository.commit(
      this.action(actor, "category_create", id, input.note, {}, created),
      guard,
      (fence) => this.repository.createStatements(id, created, now, fence),
      receipt,
    );
    await this.refreshed([slug]);
    return { ...result, categoryId: id, slug };
  }
  /** A retried create returns the identifiers of the original category. */
  private async createdReplay(actionId: string) {
    const action = await this.repository.action(actionId);
    const category =
      action && (await this.repository.category(action.target_id));
    if (!category)
      throw new ApplicationError("NOT_FOUND", "Category not found.", 404);
    return {
      actionId,
      productId: null,
      categoryId: category.id,
      slug: category.slug,
    };
  }
  async update(actor: Actor, key: string, id: string, raw: unknown) {
    administrator(actor);
    const input = updateCategoryInput.parse(raw);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        "category-update",
        key,
        { id, ...input },
        now,
      );
    const prior = await this.repository.replay<{ actionId: string }>(receipt);
    if (prior) return prior;
    const current = await this.existing(id);
    if (current.revision !== input.expectedRevision)
      throw new ApplicationError(
        "STALE_CATEGORY",
        "This category changed. Refresh before editing.",
        409,
      );
    if (
      (await this.repository.busyMerges([id])).some(
        (m) => m.state !== "complete",
      )
    )
      throw new ApplicationError(
        "MERGE_IN_PROGRESS",
        "Finish the merge involving this category first.",
        409,
      );
    const next: CategoryPatch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: categorySlug(input.slug) } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.isRankable !== undefined
        ? { isRankable: input.isRankable }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.aliases
        ? {
            aliases: input.aliases.map((a) => ({
              alias: a.alias,
              countryId: a.country ?? null,
              displayName: a.displayName ?? false,
            })),
          }
        : {}),
    };
    if (next.slug !== undefined && next.slug !== current.slug)
      await this.assertSlugAvailable(next.slug, id);
    // Like creation, new names and aliases may not collide with another
    // category in their scope. Aliases already held (such as a merged donor's
    // name) stay. A change of rankability or parent rechecks the name.
    const rankable = next.isRankable ?? current.isRankable;
    const parentId =
      next.parentId === undefined ? current.parentId : next.parentId;
    const scope = scopeFor(rankable, parentId);
    this.assertGroupAliases(rankable, next.aliases ?? current.aliases);
    const held = new Set(current.aliases.map((a) => categoryKey(a.alias)));
    const rescoped =
      rankable !== current.isRankable || parentId !== current.parentId;
    const added = [
      ...((next.name !== undefined && next.name !== current.name) || rescoped
        ? [next.name ?? current.name]
        : []),
      ...(next.aliases ?? [])
        .map((a) => a.alias)
        .filter((alias) => !held.has(categoryKey(alias))),
    ];
    if (added.length) await this.assertNameAvailable(added, scope, id);
    if (next.parentId !== undefined) await this.assertParent(id, next.parentId);
    if (next.aliases) next.aliases = await this.countryIds(next.aliases);
    const plan = planCategoryUpdate(current, next);
    const guard = {
      sql: "EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=?)",
      values: [id, current.revision] as (string | number | null)[],
    };
    fenceNames(guard, added, id, scope);
    fenceParent(guard, id, next.parentId);
    const result = await this.repository.commit(
      this.action(
        actor,
        "category_update",
        id,
        input.note,
        plan.before,
        plan.after,
      ),
      guard,
      (fence) =>
        this.repository.categoryStatements(id, current, plan.after, now, fence),
      receipt,
    );
    await this.refreshed([
      current.slug,
      ...(plan.after.slug ? [plan.after.slug] : []),
    ]);
    return result;
  }
  /** Aliases name their market by ISO code; storage uses its identifier. */
  private async countryIds(aliases: CategoryState["aliases"]) {
    const codes = [
      ...new Set(aliases.flatMap((a) => (a.countryId ? [a.countryId] : []))),
    ];
    if (!codes.length) return aliases;
    const ids = await this.repository.countryIdsByIso(codes);
    return aliases.map((a) => {
      if (!a.countryId) return { ...a, displayName: false };
      const countryId = ids.get(a.countryId.toUpperCase());
      if (!countryId)
        throw new ApplicationError(
          "INVALID_COUNTRY",
          "Choose an active country for each country-specific alias.",
        );
      return { ...a, countryId };
    });
  }
  async setFeatures(actor: Actor, key: string, raw: unknown) {
    administrator(actor);
    const input = featuresInput.parse(raw);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        "category-features",
        key,
        input,
        now,
      );
    const prior = await this.repository.replay<{ actionId: string }>(receipt);
    if (prior) return prior;
    if (new Set(input.categoryIds).size !== input.categoryIds.length)
      throw new ApplicationError(
        "INVALID_FEATURES",
        "Choose each category once.",
      );
    if (
      (await this.repository.activeCount(input.categoryIds)) !==
      input.categoryIds.length
    )
      throw new ApplicationError(
        "INVALID_FEATURES",
        "A chosen category is no longer active. Refresh and choose again.",
        409,
      );
    const countryId = (
      await this.repository.countryIdsByIso([input.country])
    ).get(input.country);
    if (!countryId)
      throw new ApplicationError(
        "INVALID_COUNTRY",
        "Choose an active country for homepage features.",
      );
    const before = await this.repository.features(countryId);
    const result = await this.repository.commit(
      // Homepage features are per country; the target names it.
      this.action(
        actor,
        "category_features",
        `features:${input.country}`,
        input.note,
        { features: before },
        { features: input.categoryIds },
      ),
      {
        sql: FEATURABLE,
        values: [JSON.stringify(input.categoryIds), input.categoryIds.length],
      },
      (fence) =>
        this.repository.featureStatements(
          countryId,
          input.categoryIds,
          now,
          fence,
        ),
      receipt,
    );
    await this.effects.invalidate([], []);
    return result;
  }
  /**
   * Replaces a food's ordered detail questions. Keys are never removed, so
   * stored answers always keep their question; retiring hides one.
   */
  async setDimensions(actor: Actor, key: string, id: string, raw: unknown) {
    administrator(actor);
    const input = dimensionsInput.parse(raw);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        "category-dimensions",
        key,
        { id, ...input },
        now,
      );
    const prior = await this.repository.replay<{ actionId: string }>(receipt);
    if (prior) return prior;
    const category = await this.existing(id);
    if (category.revision !== input.expectedRevision)
      throw new ApplicationError(
        "STALE_CATEGORY",
        "This food changed. Refresh before editing its questions.",
        409,
      );
    if (!category.isActive || !category.isRankable)
      throw new ApplicationError(
        "INVALID_DIMENSIONS",
        "Only active foods ask detail questions.",
        409,
      );
    if (
      (await this.repository.busyMerges([id])).some(
        (m) => m.state !== "complete",
      )
    )
      throw new ApplicationError(
        "MERGE_IN_PROGRESS",
        "Finish the merge involving this food first.",
        409,
      );
    const current = await this.repository.dimensions(id);
    const next = input.dimensions;
    assertDimensions(current, next);
    const before = current.map(({ key, label, description, active }) => ({
      key,
      label,
      description,
      active,
    }));
    const result = await this.repository.commit(
      this.action(
        actor,
        "category_dimensions",
        id,
        input.note,
        { dimensions: before },
        { dimensions: next },
      ),
      {
        sql: "EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=? AND is_active=1)",
        values: [id, category.revision],
      },
      (fence) =>
        this.repository.dimensionStatements(id, current, next, now, fence),
      receipt,
    );
    // Product pages show the questions; their cached copies refresh.
    await this.effects.invalidate([category.slug], []);
    return result;
  }
  /** Reverses a non-merge taxonomy action by restoring its recorded fields. */
  async reverseUpdate(
    actor: Actor,
    key: string,
    actionId: string,
    note: string,
  ) {
    administrator(actor);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        "category-reversal",
        key,
        { actionId, note },
        now,
      );
    const prior = await this.repository.replay<{ actionId: string }>(receipt);
    if (prior) return prior;
    const original = await this.repository.action(actionId);
    if (
      !original ||
      original.reversed_by ||
      !["category_update", "category_features", "category_dimensions"].includes(
        original.kind,
      )
    )
      throw new ApplicationError(
        "INVALID_REVERSAL",
        "This taxonomy action cannot be reversed.",
      );
    const before = JSON.parse(original.before_data) as CategoryPatch & {
      features?: string[];
      dimensions?: DimensionState[];
    };
    const after = JSON.parse(original.after_data) as CategoryPatch & {
      features?: string[];
      dimensions?: DimensionState[];
    };
    const action = this.action(
      actor,
      "reversal",
      actionId,
      note,
      after,
      before,
    );
    const reversed = {
      sql: "EXISTS(SELECT 1 FROM moderation_actions WHERE id=? AND reversed_by IS NULL)",
      values: [actionId] as (string | number | null)[],
    };
    if (original.kind === "category_features") {
      // Milestone 4 recorded the United States as "US".
      const iso = original.target_id.replace(/^features:/, "");
      const countryId = (await this.repository.countryIdsByIso([iso])).get(iso);
      if (!countryId)
        throw new ApplicationError(
          "REVERSAL_CONFLICT",
          "That country is no longer active.",
          409,
        );
      const current = await this.repository.features(countryId);
      if (JSON.stringify(current) !== JSON.stringify(after.features))
        throw new ApplicationError(
          "REVERSAL_CONFLICT",
          "Homepage features changed since this action.",
          409,
        );
      const restored = before.features ?? [];
      if ((await this.repository.activeCount(restored)) !== restored.length)
        throw new ApplicationError(
          "REVERSAL_CONFLICT",
          "A previously featured category was retired. Choose new features instead.",
          409,
        );
      const result = await this.repository.commit(
        action,
        {
          sql: `${reversed.sql} AND ${FEATURABLE}`,
          values: [
            ...reversed.values,
            JSON.stringify(restored),
            restored.length,
          ],
        },
        (fence) => [
          ...this.repository.featureStatements(
            countryId,
            before.features ?? [],
            now,
            fence,
          ),
          this.reversedStatement(actionId, action.id, fence),
        ],
        receipt,
      );
      await this.effects.invalidate([], []);
      return result;
    }
    if (original.kind === "category_dimensions") {
      const category = await this.existing(original.target_id);
      const current = await this.repository.dimensions(category.id);
      const stored = current.map(({ key, label, description, active }) => ({
        key,
        label,
        description,
        active,
      }));
      if (JSON.stringify(stored) !== JSON.stringify(after.dimensions))
        throw new ApplicationError(
          "REVERSAL_CONFLICT",
          "These questions changed since this action. Review the newer change first.",
          409,
        );
      // Questions the action added stay (keys are never removed), retired.
      const restored = [
        ...(before.dimensions ?? []),
        ...(after.dimensions ?? [])
          .filter((d) => !before.dimensions?.some((b) => b.key === d.key))
          .map((d) => ({ ...d, active: false })),
      ];
      const result = await this.repository.commit(
        action,
        {
          sql: `${reversed.sql} AND EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=?)`,
          values: [...reversed.values, category.id, category.revision],
        },
        (fence) => [
          ...this.repository.dimensionStatements(
            category.id,
            current,
            restored,
            now,
            fence,
          ),
          this.reversedStatement(actionId, action.id, fence),
        ],
        receipt,
      );
      await this.effects.invalidate([category.slug], []);
      return result;
    }
    const current = await this.existing(original.target_id);
    for (const [field, value] of Object.entries(after))
      if (
        JSON.stringify(
          field === "aliases"
            ? sortAliases(current.aliases)
            : current[field as keyof CategoryRecord],
        ) !==
        JSON.stringify(
          field === "aliases"
            ? sortAliases(value as CategoryState["aliases"])
            : value,
        )
      )
        throw new ApplicationError(
          "REVERSAL_CONFLICT",
          "This category changed after the action. Review the newer change first.",
          409,
        );
    // Last in, first out: a later merge involving the category goes first.
    if (
      (await this.repository.busyMerges([current.id], original.created_at))
        .length
    )
      throw new ApplicationError(
        "REVERSAL_CONFLICT",
        "Reverse the later merge involving this category first.",
        409,
      );
    if (before.slug) await this.assertSlugAvailable(before.slug, current.id);
    // Restored names must not collide with a category that claimed them since.
    const held = new Set(
      [current.name, ...current.aliases.map((a) => a.alias)].map(categoryKey),
    );
    const restoredNames = [
      ...(before.name !== undefined ? [before.name] : []),
      ...(before.aliases ?? []).map((a) => a.alias),
    ].filter((name) => !held.has(categoryKey(name)));
    const restoredScope = scopeFor(
      before.isRankable ?? current.isRankable,
      before.parentId === undefined ? current.parentId : before.parentId,
    );
    if (restoredNames.length)
      await this.assertNameAvailable(restoredNames, restoredScope, current.id);
    const guard = {
      sql: `${reversed.sql} AND EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM category_merges WHERE active=1 AND created_at>? AND ? IN (donor_id,survivor_id))`,
      values: [
        actionId,
        current.id,
        current.revision,
        original.created_at,
        current.id,
      ] as (string | number | null)[],
    };
    fenceNames(guard, restoredNames, current.id, restoredScope);
    const result = await this.repository.commit(
      action,
      guard,
      (fence) => [
        ...this.repository.categoryStatements(
          current.id,
          current,
          before,
          now,
          fence,
        ),
        this.reversedStatement(actionId, action.id, fence),
      ],
      receipt,
    );
    await this.refreshed([current.slug, ...(before.slug ? [before.slug] : [])]);
    return result;
  }
  private reversedStatement(
    originalId: string,
    reversalId: string,
    fence: { sql: string; values: (string | number | null)[] },
  ) {
    return this.repository.markReversed(originalId, reversalId, fence);
  }

  // ---- Transfer merges ------------------------------------------------------
  async merge(actor: Actor, key: string, raw: unknown) {
    administrator(actor);
    const input = mergeInput.parse(raw);
    const now = this.clock(),
      receipt = await receiptWrite(actor.id, "category-merge", key, input, now);
    const prior = await this.repository.replay<{ actionId: string }>(receipt);
    if (prior) {
      const action = await this.repository.action(prior.actionId);
      const { mergeId } = JSON.parse(action?.after_data ?? "{}") as {
        mergeId: string;
      };
      return { ...prior, ...(await this.continueMerge(actor, mergeId)) };
    }
    const donor = await this.existing(input.donorId),
      survivor = await this.existing(input.survivorId);
    this.assertMergeable(donor, survivor, input);
    if ((await this.repository.ancestors(survivor.id)).includes(donor.id))
      throw new ApplicationError(
        "INVALID_MERGE",
        "The survivor cannot sit beneath the duplicate.",
        409,
      );
    if (
      (await this.repository.busyMerges([donor.id, survivor.id])).some(
        (m) => m.state !== "complete",
      )
    )
      throw new ApplicationError(
        "MERGE_IN_PROGRESS",
        "Another merge involving these categories is in progress.",
        409,
      );
    const mergeId = this.newId(),
      action = this.action(
        actor,
        "category_merge",
        donor.id,
        input.note,
        { donor, survivor },
        { mergeId, survivorId: survivor.id },
      );
    const result = await this.repository.commit(
      action,
      {
        sql: "EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=? AND is_active=1) AND EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=? AND is_active=1)",
        values: [donor.id, donor.revision, survivor.id, survivor.revision],
      },
      (fence) =>
        this.repository.beginMergeStatements(
          {
            id: mergeId,
            donorId: donor.id,
            survivorId: survivor.id,
            actionId: action.id,
          },
          now,
          fence,
        ),
      receipt,
    );
    return { ...result, ...(await this.continueMerge(actor, mergeId)) };
  }
  private assertMergeable(
    donor: CategoryRecord,
    survivor: CategoryRecord,
    input: { donorRevision: number; survivorRevision: number },
  ) {
    if (donor.id === survivor.id)
      throw new ApplicationError(
        "INVALID_MERGE",
        "Choose two different categories.",
      );
    if (
      donor.revision !== input.donorRevision ||
      survivor.revision !== input.survivorRevision
    )
      throw new ApplicationError(
        "STALE_CATEGORY",
        "A category changed. Refresh before merging.",
        409,
      );
    if (!donor.isActive || !survivor.isActive)
      throw new ApplicationError(
        "INVALID_MERGE",
        "Both categories must be active.",
        409,
      );
    if (donor.isRankable !== survivor.isRankable)
      throw new ApplicationError(
        "INVALID_MERGE",
        "Merge rankable categories only into rankable categories.",
        409,
      );
  }
  /** Processes bounded pages; returns whether the merge is complete. */
  async continueMerge(actor: Actor | null, mergeId: string) {
    if (actor) administrator(actor);
    let merge = await this.loadMerge(mergeId);
    for (let page = 0; page < PAGES_PER_REQUEST; page++) {
      if (merge.state === "transferring") {
        const result = await this.repository.transferPage(merge, this.clock());
        if (result.moved) {
          await this.effects.rebuildVersions(result.versions);
        } else {
          const donor = await this.existing(merge.donor_id);
          await this.repository.finalizeMerge(merge, donor, this.clock());
          await this.rebuildDerived(merge);
        }
      } else if (merge.state === "reversing") {
        const result = await this.repository.reversePage(merge, this.clock());
        if (!result.restored) {
          await this.repository.finishReversal(merge, this.clock());
          await this.rebuildDerived(merge);
        }
      }
      merge = await this.loadMerge(mergeId);
      if (merge.state === "complete" || merge.state === "reversed") break;
    }
    return { mergeId, state: merge.state };
  }
  private async loadMerge(id: string) {
    const merge = await this.repository.merge(id);
    if (!merge)
      throw new ApplicationError("NOT_FOUND", "Merge not found.", 404);
    return merge;
  }
  async reverseMerge(actor: Actor, key: string, mergeId: string, note: string) {
    administrator(actor);
    const now = this.clock(),
      receipt = await receiptWrite(
        actor.id,
        "category-merge-reversal",
        key,
        { mergeId, note },
        now,
      );
    const prior = await this.repository.replay<{ actionId: string }>(receipt);
    if (prior)
      return { ...prior, ...(await this.continueMerge(actor, mergeId)) };
    const merge = await this.loadMerge(mergeId);
    if (merge.state !== "complete" || !merge.active)
      throw new ApplicationError(
        "INVALID_REVERSAL",
        "Only a completed active merge can be reversed.",
        409,
      );
    // Last in, first out: a later merge involving either category goes first.
    if (
      (
        await this.repository.busyMerges(
          [merge.donor_id, merge.survivor_id],
          merge.created_at,
        )
      ).length
    )
      throw new ApplicationError(
        "REVERSAL_CONFLICT",
        "Reverse the later merge involving these categories first.",
        409,
      );
    // Later edits rewrite rows the reversal restores (such as alias sets), so
    // they are undone first to keep the reversal exact.
    const later = [
      merge.donor_id,
      merge.survivor_id,
      merge.created_at,
    ] as const;
    if (await this.repository.laterEdits(...later))
      throw new ApplicationError(
        "REVERSAL_CONFLICT",
        "Reverse the later edits to these categories first.",
        409,
      );
    const action = this.action(
      actor,
      "reversal",
      merge.action_id,
      note,
      { mergeId, state: "complete" },
      { mergeId, state: "reversed" },
    );
    const result = await this.repository.commit(
      action,
      {
        sql: `EXISTS(SELECT 1 FROM category_merges WHERE id=? AND state='complete' AND active=1) AND NOT ${LATER_EDITS}`,
        values: [mergeId, ...later],
      },
      (fence) => [
        ...this.repository.beginReversalStatements(
          merge,
          action.id,
          now,
          fence,
        ),
        this.reversedStatement(merge.action_id, action.id, fence),
      ],
      receipt,
    );
    return { ...result, ...(await this.continueMerge(actor, mergeId)) };
  }
  /** Hourly: finish merges interrupted between requests. */
  async continueInterrupted() {
    let advanced = 0;
    for (const merge of await this.repository.unfinishedMerges()) {
      await this.continueMerge(null, merge.id).catch(() => undefined);
      advanced++;
    }
    // Finished merges whose derived rebuild failed are retried until it holds.
    for (const id of await this.repository.pendingDerived()) {
      await this.rebuildDerived(await this.loadMerge(id)).catch(
        () => undefined,
      );
      advanced++;
    }
    return advanced;
  }
  /**
   * Rebuilds aggregates, search, Trending and caches for a finished merge or
   * reversal. The pending marker committed with it is cleared only after
   * this succeeds, so hourly automation retries a failed rebuild.
   */
  private async rebuildDerived(merge: MergeRecord) {
    const donor = await this.existing(merge.donor_id),
      survivor = await this.existing(merge.survivor_id);
    const affected = await this.repository.affected(merge.id);
    await this.effects.refreshTrending([donor.id, survivor.id]);
    await this.refreshed(
      [donor.slug, survivor.slug],
      affected.versions,
      affected.products,
    );
    await this.repository.clearDerived(merge.id);
  }
}

function assertDimensions(current: { key: string }[], next: DimensionState[]) {
  const keys = new Set(next.map((d) => d.key));
  if (keys.size !== next.length)
    throw new ApplicationError(
      "INVALID_DIMENSIONS",
      "Use each question key once.",
    );
  if (current.some((d) => !keys.has(d.key)))
    throw new ApplicationError(
      "INVALID_DIMENSIONS",
      "Questions are never removed. Retire one instead.",
    );
  const active = next.filter((d) => d.active);
  if (active.length > MAX_ACTIVE_DIMENSIONS)
    throw new ApplicationError(
      "INVALID_DIMENSIONS",
      `A food asks at most ${MAX_ACTIVE_DIMENSIONS} detail questions.`,
    );
  const labels = new Set(active.map((d) => d.label.toLocaleLowerCase()));
  if (labels.size !== active.length)
    throw new ApplicationError(
      "INVALID_DIMENSIONS",
      "Give each active question its own label.",
    );
}
