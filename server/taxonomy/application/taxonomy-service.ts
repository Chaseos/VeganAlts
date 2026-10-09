import { ApplicationError } from "../../shared/domain/errors";
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
  categorySlug,
  createCategoryInput,
  featuresInput,
  mergeInput,
  planCategoryUpdate,
  updateCategoryInput,
  sortAliases,
  type CategoryPatch,
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
  tree(actor: Actor) {
    administrator(actor);
    return this.repository.tree();
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
  private async assertNameAvailable(names: string[], except?: string) {
    const keys = new Set(names.map(categoryKey));
    const taken = (await this.repository.names()).find(
      (n) => n.id !== except && keys.has(categoryKey(n.value)),
    );
    if (taken)
      throw new ApplicationError(
        "CATEGORY_EXISTS",
        `“${taken.value}” already names a category${taken.active ? "" : " (retired)"}. Use or alias the existing category.`,
        409,
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
    // Deterministic duplicate checks before any model call.
    await this.assertNameAvailable([input.name, ...input.aliases]);
    if (input.parentId) await this.assertParent(null, input.parentId);
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
        parentId: input.parentId ?? null,
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
    const data = categoryProposalInput.parse(
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
      const aliases = [
        ...target.aliases,
        { alias: data.name, countryId: null },
        ...data.aliases.map((alias) => ({ alias, countryId: null })),
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
    await this.assertNameAvailable([data.name]);
    const parentId =
      input.parentId === undefined
        ? (proposal.parent_id ?? null)
        : input.parentId;
    await this.assertParent(null, parentId);
    const categoryId = this.newId();
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
    await this.assertNameAvailable([input.name, ...input.aliases]);
    await this.assertParent(null, input.parentId);
    const id = this.newId();
    const created = {
      name: input.name,
      slug,
      parentId: input.parentId,
      isRankable: input.isRankable,
      aliases: input.aliases,
    };
    const result = await this.repository.commit(
      this.action(actor, "category_create", id, input.note, {}, created),
      { sql: "1", values: [] },
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
              countryId: a.country ? "US" : null,
            })),
          }
        : {}),
    };
    if (next.slug !== undefined && next.slug !== current.slug)
      await this.assertSlugAvailable(next.slug, id);
    if (next.name !== undefined && next.name !== current.name)
      await this.assertNameAvailable([next.name], id);
    if (next.parentId !== undefined) await this.assertParent(id, next.parentId);
    if (next.aliases) next.aliases = await this.countryIds(next.aliases);
    const plan = planCategoryUpdate(current, next);
    const result = await this.repository.commit(
      this.action(
        actor,
        "category_update",
        id,
        input.note,
        plan.before,
        plan.after,
      ),
      {
        sql: "EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=?)",
        values: [id, current.revision],
      },
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
  /** "US" in input names the market; storage uses its country identifier. */
  private async countryIds(
    aliases: { alias: string; countryId: string | null }[],
  ) {
    if (!aliases.some((a) => a.countryId)) return aliases;
    const us = await this.repository.usCountryId();
    return aliases.map((a) => ({ ...a, countryId: a.countryId ? us : null }));
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
    const before = await this.repository.features();
    const result = await this.repository.commit(
      this.action(
        actor,
        "category_features",
        "US",
        input.note,
        { features: before },
        { features: input.categoryIds },
      ),
      { sql: "1", values: [] },
      (fence) =>
        this.repository.featureStatements(input.categoryIds, now, fence),
      receipt,
    );
    await this.effects.invalidate([], []);
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
      !["category_update", "category_features"].includes(original.kind)
    )
      throw new ApplicationError(
        "INVALID_REVERSAL",
        "This taxonomy action cannot be reversed.",
      );
    const before = JSON.parse(original.before_data) as CategoryPatch & {
      features?: string[];
    };
    const after = JSON.parse(original.after_data) as CategoryPatch & {
      features?: string[];
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
      const current = await this.repository.features();
      if (JSON.stringify(current) !== JSON.stringify(after.features))
        throw new ApplicationError(
          "REVERSAL_CONFLICT",
          "Homepage features changed since this action.",
          409,
        );
      const result = await this.repository.commit(
        action,
        reversed,
        (fence) => [
          ...this.repository.featureStatements(
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
    const current = await this.existing(original.target_id);
    for (const [field, value] of Object.entries(after))
      if (
        JSON.stringify(
          field === "aliases"
            ? sortAliases(current.aliases)
            : current[field as keyof CategoryRecord],
        ) !== JSON.stringify(value)
      )
        throw new ApplicationError(
          "REVERSAL_CONFLICT",
          "This category changed after the action. Review the newer change first.",
          409,
        );
    if (before.slug) await this.assertSlugAvailable(before.slug, current.id);
    const result = await this.repository.commit(
      action,
      {
        sql: `${reversed.sql} AND EXISTS(SELECT 1 FROM categories WHERE id=? AND revision=?)`,
        values: [actionId, current.id, current.revision],
      },
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
    if (donor.ratingDimensions || survivor.ratingDimensions)
      throw new ApplicationError(
        "INVALID_MERGE",
        "Categories with detailed rating dimensions cannot be merged yet.",
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
          const affected = await this.repository.finalizeMerge(
            merge,
            donor,
            this.clock(),
          );
          const survivor = await this.existing(merge.survivor_id);
          await this.effects.refreshTrending([donor.id, survivor.id]);
          await this.refreshed(
            [donor.slug, survivor.slug],
            affected.versions,
            affected.products,
          );
        }
      } else if (merge.state === "reversing") {
        const result = await this.repository.reversePage(merge, this.clock());
        if (!result.restored) {
          const affected = await this.repository.finishReversal(
            merge,
            this.clock(),
          );
          const donor = await this.existing(merge.donor_id),
            survivor = await this.existing(merge.survivor_id);
          await this.effects.refreshTrending([donor.id, survivor.id]);
          await this.refreshed(
            [donor.slug, survivor.slug],
            affected.versions,
            affected.products,
          );
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
        sql: "EXISTS(SELECT 1 FROM category_merges WHERE id=? AND state='complete' AND active=1)",
        values: [mergeId],
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
    return advanced;
  }
}
