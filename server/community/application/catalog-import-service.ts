import { ApplicationError } from "../../shared/domain/errors";
import type { MediaStorage } from "../../media/domain/media";
import type { LineRefresh } from "../../ranking/infrastructure/line-refresh";
import {
  canonical,
  IMPORT_ACTION,
  IMPORT_AFTER,
  IMPORT_BEFORE,
  IMPORT_CHANGE_SUMMARY,
  IMPORT_OPERATION,
  importBrandId,
  importClassification,
  importIds,
  importImageId,
  importLineId,
  importPhotoKey,
  importSubmission,
  isLineFirst,
  type ImportFacts,
  type ImportPhoto,
} from "../domain/catalog-import";
import {
  retailerProposal,
  reviewDecision,
  type Actor,
  type RetailerInput,
  type SubmissionInput,
} from "../domain/contracts";
import {
  administrator,
  fingerprint,
  normalizeName,
  slug,
} from "../domain/policy";
import {
  catalogEntryStatements,
  catalogProductSlug,
  type CatalogImage,
} from "../infrastructure/catalog-entry";
import type { CatalogDecisionRepository } from "../infrastructure/catalog-decision-repository";
import type { CommunityLookupRepository } from "../infrastructure/lookup-repository";
import type { ModerationRepository } from "../infrastructure/moderation-repository";
import { receiptWrite, replay } from "../infrastructure/receipts";

// The owner's store-photo import (docs/IMPORTER_PLAN.md, owner decision
// 2026-10-16): each product is published in one transaction with the
// statements a community submission publishes with, attributed to the owner,
// without the review queue, and audited as a reversible `product_import`
// action. Runs on Workers and in Node; files are read by the caller.

/** A store the import needs, proposed and accepted like one on the site. */
export interface ImportStore {
  name: string;
  aliases: string[];
  websiteUrl: string;
}
export interface ImportTarget {
  // Food slug → category id.
  foods: Map<string, string>;
  // A store's normalized name or other name → retailer id.
  stores: Map<string, string>;
}
export type ImportOutcome =
  | { status: "written"; productId: string; slug: string }
  | { status: "replayed"; productId: string }
  | { status: "changed"; productId: string }
  | { status: "ready"; productId: string; waitsForLine: boolean }
  | { status: "blocked"; productId: string; reason: string };
// The bytes of one copy of a product's photo, read by the caller.
export type PhotoBytes = (
  photo: ImportPhoto,
  kind: "full" | "thumbnail",
) => Promise<Uint8Array>;

// The id a store the run adds stands in with during a dry run; ids follow
// the contract's pattern.
const PENDING_STORE = "pending-store-";
const blocked = (productId: string, reason: string): ImportOutcome => ({
  status: "blocked",
  productId,
  reason,
});

export class CatalogImportService {
  constructor(
    private readonly db: D1Database,
    private readonly storage: MediaStorage,
    private readonly lookup: CommunityLookupRepository,
    private readonly moderation: ModerationRepository,
    private readonly catalog: CatalogDecisionRepository,
    private readonly lines: LineRefresh,
    // A store proposal, as the Contribute page makes it
    // (ContributionService.proposeRetailer).
    private readonly proposeStore: (
      actor: Actor,
      key: string,
      input: RetailerInput,
    ) => Promise<{ id: string }>,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}

  /** Each store's retailer, when it already has a market in the country. */
  async storeIds(stores: ImportStore[], country: string) {
    const found = new Map<string, string>();
    for (const store of stores) {
      const names = [store.name, ...store.aliases].map(normalizeName);
      const row = await this.db
        .prepare(
          `SELECT r.id FROM retailers r JOIN retailer_markets m ON m.retailer_id=r.id AND m.is_active=1 JOIN countries c ON c.id=m.country_id AND c.iso2=?
          WHERE r.normalized_name IN (SELECT value FROM json_each(?)) OR r.id IN (SELECT retailer_id FROM retailer_aliases WHERE normalized_name IN (SELECT value FROM json_each(?))) LIMIT 1`,
        )
        .bind(country, JSON.stringify(names), JSON.stringify(names))
        .first<string>("id");
      if (row) for (const name of names) found.set(name, row);
    }
    return found;
  }

  /**
   * Adds the stores that have no market in the country yet: a retailer
   * proposal by the operator, then the operator's acceptance, the same rows
   * an acceptance in the moderation inbox writes.
   */
  async ensureStores(actor: Actor, stores: ImportStore[], country: string) {
    administrator(actor);
    const created: string[] = [];
    const existing = await this.storeIds(stores, country);
    for (const store of stores) {
      if (existing.has(normalizeName(store.name))) continue;
      const key = `import-store-${slug(store.name)}-${country.toLowerCase()}`;
      const proposal = await this.proposeStore(actor, key, {
        name: store.name,
        country,
        websiteUrl: store.websiteUrl,
        aliases: store.aliases,
        note: "A grocery chain where the owner photographed products for the store-photo import.",
      });
      await this.acceptStore(
        actor,
        proposal.id,
        `${key}-accept`,
        "Store from the owner's store-photo import.",
      );
      created.push(store.name);
    }
    return { created, ids: await this.storeIds(stores, country) };
  }

  // The retailer branch of ModerationService.decide for an accepted
  // proposal: the same action kind, receipt operation and catalog decision.
  private async acceptStore(
    actor: Actor,
    proposalId: string,
    key: string,
    note: string,
  ) {
    const proposal = await this.moderation.proposal(proposalId);
    if (!proposal || proposal.target_type !== "retailer")
      throw new ApplicationError("NOT_FOUND", "Proposal not found.", 404);
    const input = reviewDecision.parse({
      decision: "accept",
      expectedRevision: proposal.updated_at,
      note,
    });
    const now = this.clock();
    const receipt = await receiptWrite(
      actor.id,
      "moderate-proposal",
      key,
      { id: proposalId, ...input },
      now,
    );
    const prior = await this.moderation.replay<{ actionId: string }>(receipt);
    if (prior) return prior;
    if (proposal.status !== "pending")
      throw new ApplicationError(
        "STALE_DECISION",
        "This proposal has already been decided.",
        409,
      );
    const proposed = JSON.parse(proposal.proposed_data) as unknown;
    return this.catalog.acceptRetailer(
      {
        id: this.newId(),
        actor,
        kind: "proposal_accept",
        targetId: proposalId,
        productId: null,
        before: { review: proposal },
        after: proposed,
        note: input.note,
        now,
      },
      proposal,
      retailerProposal.parse(proposed),
      receipt,
    );
  }

  private submission(
    facts: ImportFacts,
    target: ImportTarget,
  ): { input: SubmissionInput } | { error: string } {
    const categoryId = target.foods.get(facts.food);
    if (!categoryId)
      return { error: `The food "${facts.food}" is not in this database.` };
    const retailerIds = facts.stores.map((store) =>
      target.stores.get(normalizeName(store)),
    );
    const missing = facts.stores.filter((_, index) => !retailerIds[index]);
    if (missing.length)
      return { error: `No retailer for ${missing.join(", ")}.` };
    return {
      input: importSubmission(facts, {
        categoryId,
        retailerIds: [...new Set(retailerIds as string[])],
      }),
    };
  }

  private receipt(actor: Actor, facts: ImportFacts, now: number) {
    return receiptWrite(
      actor.id,
      IMPORT_OPERATION,
      importIds(facts.sourceKey).receiptKey,
      canonical(facts),
      now,
    );
  }

  /** Whether a product was imported, changed since, or can be imported. */
  private async previous(actor: Actor, facts: ImportFacts) {
    const productId = importIds(facts.sourceKey).product;
    try {
      const prior = await replay<{ productId: string }>(
        this.db,
        await this.receipt(actor, facts, this.clock()),
      );
      if (prior)
        return { status: "replayed", productId } satisfies ImportOutcome;
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.code === "IDEMPOTENCY_CONFLICT"
      )
        return { status: "changed", productId } satisfies ImportOutcome;
      throw error;
    }
    return null;
  }

  /**
   * What an import would do, without writing: the dry run. `stores` lists
   * the stores the run adds before its products; a line's later products
   * wait for the line its first product starts.
   */
  async plan(
    actor: Actor,
    facts: ImportFacts,
    target: ImportTarget,
    pending: { lines: Set<string>; stores: Set<string> },
  ): Promise<ImportOutcome> {
    const ids = importIds(facts.sourceKey);
    const earlier = await this.previous(actor, facts);
    if (earlier) return earlier;
    const stores = new Map(target.stores);
    // A store the run adds first stands in with a placeholder id.
    let placeholder = 0;
    for (const name of pending.stores)
      stores.set(name, `${PENDING_STORE}${placeholder++}`);
    const built = this.submission(facts, { ...target, stores });
    if ("error" in built) return blocked(ids.product, built.error);
    const lineId = importLineId(facts.line.first);
    const waitsForLine = !isLineFirst(facts) && pending.lines.has(lineId);
    const input = {
      ...built.input,
      // Placeholder stores and a line the run starts aren't in the
      // database yet; the identity checks don't depend on them.
      retailerIds: built.input.retailerIds?.filter(
        (id) => !id.startsWith(PENDING_STORE),
      ),
      ...(waitsForLine ? { lineId: undefined } : {}),
    };
    let context;
    try {
      context = await this.lookup.context(input);
    } catch (error) {
      if (error instanceof ApplicationError)
        return blocked(ids.product, error.message);
      throw error;
    }
    const [owner, existing, slugTaken] = await Promise.all([
      this.moderation.identityOwner(context.identity),
      this.db
        .prepare("SELECT 1 FROM products WHERE id=?")
        .bind(ids.product)
        .first(),
      this.db
        .prepare(
          "SELECT 1 FROM products WHERE country_id=? AND slug=? AND id<>?",
        )
        .bind(
          context.countryId,
          catalogProductSlug(context.brandName, facts.name, ids.product),
          ids.product,
        )
        .first(),
    ]);
    if (owner)
      return blocked(
        ids.product,
        owner === ids.product
          ? "The product exists without its import receipt."
          : `An exact duplicate is already listed (product ${owner}).`,
      );
    if (existing)
      return blocked(
        ids.product,
        "The product exists without its import receipt.",
      );
    if (slugTaken)
      return blocked(
        ids.product,
        "Another product has this product's address.",
      );
    return { status: "ready", productId: ids.product, waitsForLine };
  }

  /**
   * Imports one product: its photos go to R2, then the product, its line
   * (when it starts one), photos, stores, search documents, line statistics,
   * `product_import` action, audit entries and receipt in one transaction.
   */
  async importProduct(
    actor: Actor,
    run: { id: string; manifestHash: string },
    facts: ImportFacts,
    target: ImportTarget,
    read: PhotoBytes,
  ): Promise<ImportOutcome> {
    administrator(actor);
    const ids = importIds(facts.sourceKey);
    const earlier = await this.previous(actor, facts);
    if (earlier) return earlier;
    const built = this.submission(facts, target);
    if ("error" in built) return blocked(ids.product, built.error);
    const input = built.input;
    let context;
    try {
      context = await this.lookup.context(input);
    } catch (error) {
      if (error instanceof ApplicationError)
        return blocked(
          ids.product,
          error.code === "INVALID_LINE"
            ? "Its line's first product isn't imported yet."
            : error.message,
        );
      throw error;
    }
    const images: CatalogImage[] = [];
    for (const photo of facts.photos) {
      const imageId = importImageId(
        facts.sourceKey,
        photo.slot,
        photo.full.sha256,
      );
      const derivatives = [];
      for (const kind of ["full", "thumbnail"] as const) {
        const bytes = await read(photo, kind);
        const expected = photo[kind];
        if (
          bytes.length !== expected.bytes ||
          (await fingerprint(bytes)) !== expected.sha256
        )
          return blocked(
            ids.product,
            `The ${photo.slot} photo's ${kind} copy changed since the manifest was built.`,
          );
        const key = importPhotoKey(ids.product, ids.version, imageId, kind);
        await this.storage.put(key, bytes, "image/webp");
        derivatives.push({
          kind,
          key,
          width: expected.width,
          height: expected.height,
        });
      }
      images.push({ slot: photo.slot, imageId, derivatives });
    }
    const now = this.clock();
    const receipt = await this.receipt(actor, facts, now);
    const lineId = input.lineId ?? `line-${ids.product}`;
    // Fresh, by an active operator, into an open country and food; a later
    // product joins its line of the same brand and country. Keys and unique
    // indexes refuse anything else, and the batch rolls back.
    const guard = `NOT EXISTS(SELECT 1 FROM contribution_receipts WHERE user_id=? AND operation=? AND idempotency_key=?)
      AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')
      AND EXISTS(SELECT 1 FROM countries WHERE id=? AND is_active=1)
      AND (SELECT COUNT(*) FROM categories WHERE id IN (SELECT value FROM json_each(?)) AND is_active=1 AND is_rankable=1)=?
      AND (?='' OR EXISTS(SELECT 1 FROM product_families WHERE id=? AND country_id=? AND brand_id=?))`;
    const fence = [
      receipt.userId,
      receipt.operation,
      receipt.key,
      actor.id,
      context.countryId,
      JSON.stringify(input.categoryIds),
      input.categoryIds.length,
      input.lineId ?? "",
      input.lineId ?? "",
      context.countryId,
      context.brandId ?? "",
    ];
    const entry = catalogEntryStatements(
      this.db,
      this.lines,
      {
        productId: ids.product,
        versionId: ids.version,
        userId: actor.id,
        input,
        context,
        classification: { ...importClassification(facts), reviewedBy: null },
        images,
        newBrandId: importBrandId(normalizeName(context.brandName)),
        changeSummary: IMPORT_CHANGE_SUMMARY,
      },
      guard,
      fence,
      now,
    );
    const note = `Imported from the store photos: ${facts.sourceKey} (run ${run.id}).`;
    const audit = (
      id: string,
      action: string,
      before: unknown,
      after: unknown,
    ) =>
      this.db
        .prepare(
          `INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,before_data,after_data,created_at) SELECT ?,?,?,'product',?,?,?,? WHERE ${guard}`,
        )
        .bind(
          id,
          actor.id,
          action,
          ids.product,
          before === null ? null : JSON.stringify(before),
          JSON.stringify(after),
          now,
          ...fence,
        );
    const statements = [
      ...entry.statements,
      this.db
        .prepare(
          `INSERT INTO moderation_actions(id,actor_id,kind,target_id,product_id,before_data,after_data,note,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          ids.action,
          actor.id,
          IMPORT_ACTION,
          ids.product,
          ids.product,
          JSON.stringify(IMPORT_BEFORE),
          JSON.stringify(IMPORT_AFTER),
          note,
          now,
          ...fence,
        ),
      // The action's entry, as ModerationRepository.commit writes one.
      audit(ids.action, IMPORT_ACTION, IMPORT_BEFORE, {
        value: IMPORT_AFTER,
        note,
      }),
      // The publication's entry, as a submission's publication writes one.
      audit(ids.published, "product_published", null, {
        import: {
          runId: run.id,
          sourceKey: facts.sourceKey,
          manifestHash: run.manifestHash,
        },
        input,
      }),
      this.db
        .prepare(
          `INSERT INTO contribution_receipts(user_id,operation,idempotency_key,input_hash,result_data,created_at) SELECT ?,?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          receipt.userId,
          receipt.operation,
          receipt.key,
          receipt.hash,
          JSON.stringify({
            productId: ids.product,
            slug: entry.slug,
            lineId,
            runId: run.id,
          }),
          now,
          ...fence,
        ),
    ];
    try {
      const results = await this.db.batch(statements);
      if (!results.at(-1)!.meta.changes)
        return blocked(
          ids.product,
          "Its line, food, country or operator changed during the import.",
        );
    } catch (error) {
      const earlier = await this.previous(actor, facts);
      if (earlier) return earlier;
      if (
        error instanceof Error &&
        /UNIQUE constraint failed/.test(error.message)
      )
        return blocked(
          ids.product,
          /product_identity_keys/.test(error.message)
            ? "An exact duplicate is already listed."
            : `A conflicting record exists (${error.message.replace(/^.*UNIQUE constraint failed: /, "")}).`,
        );
      throw error;
    }
    return { status: "written", productId: ids.product, slug: entry.slug };
  }

  /** The run's start or end, in the audit log. */
  async recordRun(
    actor: Actor,
    runId: string,
    action: "catalog_import_started" | "catalog_import_finished",
    data: unknown,
  ) {
    administrator(actor);
    await this.db
      .prepare(
        "INSERT INTO audit_log(id,actor_user_id,action,entity_type,entity_id,after_data,created_at) SELECT ?,?,?,'catalog_import',?,?,? WHERE EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND account_state='active')",
      )
      .bind(
        this.newId(),
        actor.id,
        action,
        runId,
        JSON.stringify(data),
        this.clock(),
        actor.id,
      )
      .run();
  }
}
