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
  MANUFACTURER_LABEL,
  importBrandId,
  importClassification,
  importEvidenceNote,
  importAllergenDeclaration,
  importIds,
  importImageId,
  importLineId,
  importPhotoKey,
  importSubmission,
  isLineFirst,
  type ImportFacts,
  type ImportFormulaUpdate,
  type ImportPhoto,
} from "../domain/catalog-import";
import type {
  CatalogPatch,
  FormulaClassification,
  IngredientTranscriptionSnapshot,
  ProductSnapshot,
} from "../domain/moderation";
import {
  retailerProposal,
  reviewDecision,
  type Actor,
  type RetailerInput,
  type SubmissionInput,
} from "../domain/contracts";
import {
  administrator,
  effectiveDate,
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
  // Allergen vocabulary accepted for the products' country.
  allergens: ReadonlySet<string>;
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
const FORMULA_IMPORT_OPERATION = "catalog-import-formula";
const RECONCILIATION_OPERATION = "catalog-import-reconciliation";
const blocked = (productId: string, reason: string): ImportOutcome => ({
  status: "blocked",
  productId,
  reason,
});
type ExistingImport =
  | {
      snapshot?: ProductSnapshot;
      receipt: Awaited<ReturnType<typeof receiptWrite>>;
    }
  | ImportOutcome;

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
        allergens: importAllergenDeclaration(
          facts.transcription.allergens,
          target.allergens,
        ),
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
   * Validate a changed receipt as an update to this import's own product.
   * Existing products are reconciled in place so ratings and formula history
   * remain attached to their original version.
   */
  private async existingImport(
    actor: Actor,
    facts: ImportFacts,
    target: ImportTarget,
    includeSnapshot = false,
  ): Promise<ExistingImport> {
    const productId = importIds(facts.sourceKey).product;
    const hash = await fingerprint(canonical(facts));
    const key = `import-reconcile-${hash}`;
    const receipt = await receiptWrite(
      actor.id,
      RECONCILIATION_OPERATION,
      key,
      canonical(facts),
      this.clock(),
    );
    const categoryId = target.foods.get(facts.food) ?? null;
    const current = await this.db
      .prepare(
        `SELECT p.name,p.flavor,p.lifecycle_status AS lifecycle,p.product_family_id AS familyId,lower(c.iso2) AS countryCode,b.name AS brandName,pf.canonical_name AS lineName,v.id AS versionId,
        (SELECT a.actor_id FROM moderation_actions a WHERE a.kind=? AND a.product_id=p.id AND a.reversed_by IS NULL ORDER BY a.created_at LIMIT 1) AS importActorId,
        EXISTS(SELECT 1 FROM moderation_actions a JOIN contribution_receipts r ON r.user_id=a.actor_id AND r.operation=? AND r.idempotency_key=? WHERE a.kind=? AND a.product_id=p.id AND a.reversed_by IS NULL) AS hasOriginalReceipt,
        EXISTS(SELECT 1 FROM product_categories pc WHERE pc.product_id=p.id AND pc.category_id=?) AS hasFood,
        (SELECT r.input_hash FROM contribution_receipts r WHERE r.user_id=? AND r.operation=? AND r.idempotency_key=?) AS reconciledHash
        FROM products p JOIN countries c ON c.id=p.country_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN product_families pf ON pf.id=p.product_family_id JOIN product_versions v ON v.product_id=p.id AND v.is_current=1 WHERE p.id=?`,
      )
      .bind(
        IMPORT_ACTION,
        IMPORT_OPERATION,
        importIds(facts.sourceKey).receiptKey,
        IMPORT_ACTION,
        categoryId,
        receipt.userId,
        receipt.operation,
        receipt.key,
        productId,
      )
      .first<{
        name: string;
        flavor: string | null;
        lifecycle: string;
        familyId: string;
        countryCode: string;
        brandName: string | null;
        lineName: string | null;
        versionId: string;
        importActorId: string | null;
        hasOriginalReceipt: number;
        hasFood: number;
        reconciledHash: string | null;
      }>();
    if (!current)
      return { status: "changed", productId } satisfies ImportOutcome;
    if (current.reconciledHash) {
      return current.reconciledHash === receipt.hash
        ? ({ status: "replayed", productId } satisfies ImportOutcome)
        : ({ status: "changed", productId } satisfies ImportOutcome);
    }
    if (!current.importActorId || current.hasOriginalReceipt !== 1)
      return blocked(
        productId,
        "The existing product is not an active store-photo import and needs a manual review.",
      );
    if (
      current.lifecycle !== "active" ||
      !current.brandName ||
      normalizeName(current.name) !== normalizeName(facts.name) ||
      normalizeName(current.brandName) !== normalizeName(facts.brand) ||
      normalizeName(current.flavor ?? "") !==
        normalizeName(facts.flavor ?? "") ||
      current.countryCode.toUpperCase() !== facts.country ||
      current.familyId !== importLineId(facts.line.first) ||
      normalizeName(current.lineName ?? "") !==
        normalizeName(facts.line.name) ||
      current.versionId !== importIds(facts.sourceKey).version ||
      !categoryId ||
      current.hasFood !== 1
    )
      return { status: "changed", productId } satisfies ImportOutcome;
    const snapshot = includeSnapshot
      ? await this.moderation.snapshot(productId)
      : undefined;
    return { snapshot, receipt };
  }

  private transcriptionValue(
    facts: ImportFacts,
    sourceImageIds: string[],
    createdAt: number,
  ): IngredientTranscriptionSnapshot {
    return {
      packageIngredients: facts.transcription.ingredients ?? null,
      packageContains: facts.transcription.contains ?? null,
      packageMayContain: facts.transcription.mayContain ?? null,
      sourceImageIds,
      readings: facts.transcription.readings,
      verification: facts.transcription.verification,
      assessment: facts.transcription.assessment,
      onlineIngredients:
        facts.transcription.onlineSupplement?.ingredients ?? null,
      onlineContains: facts.transcription.onlineSupplement?.contains ?? null,
      onlineMayContain:
        facts.transcription.onlineSupplement?.mayContain ?? null,
      onlineUrl: facts.transcription.onlineSupplement?.url ?? null,
      onlineAccessedAt:
        facts.transcription.onlineSupplement?.accessedAt ?? null,
      onlineProductMatch:
        facts.transcription.onlineSupplement?.productMatch ?? null,
      createdAt,
    };
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
    if (earlier?.status === "replayed") return earlier;
    if (earlier?.status === "changed") {
      const existing = await this.existingImport(actor, facts, target);
      return "status" in existing
        ? existing
        : { status: "ready", productId: ids.product, waitsForLine: false };
    }
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
          catalogProductSlug(
            context.brandName,
            facts.name,
            ids.product,
            context.foodSlug,
          ),
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
   * Reconciles a reviewed change to a product created by this importer. The
   * product and its current formula stay in place; ratings and older photos
   * remain attached to their original records.
   */
  private async reconcileExistingProduct(
    actor: Actor,
    run: { id: string; manifestHash: string },
    facts: ImportFacts,
    target: ImportTarget,
    read: PhotoBytes,
  ): Promise<ImportOutcome> {
    const ids = importIds(facts.sourceKey);
    const existing = await this.existingImport(actor, facts, target, true);
    if ("status" in existing) return existing;
    if (!existing.snapshot)
      return blocked(ids.product, "The imported product could not be loaded.");
    const { snapshot, receipt } = existing;
    const built = this.submission(facts, target);
    if ("error" in built) return blocked(ids.product, built.error);

    const current = snapshot.images.filter(
      (image) => image.versionId === snapshot.versionId,
    );
    const currentAccepted = new Map(
      current
        .filter((image) => image.state === "accepted")
        .map((image) => [image.slot, image]),
    );
    const allImages = new Map(current.map((image) => [image.id, image]));
    const images: CatalogImage[] = [];
    const beforeImageStates = new Map<string, string>();
    const afterImageStates = new Map<string, string>();
    for (const photo of facts.photos) {
      const imageId = importImageId(
        facts.sourceKey,
        photo.slot,
        photo.full.sha256,
      );
      const old = currentAccepted.get(photo.slot);
      if (old?.id === imageId) continue;
      const existingImage = allImages.get(imageId);
      if (
        existingImage?.state === "rejected" ||
        existingImage?.state === "pending"
      )
        return blocked(
          ids.product,
          `The reviewed ${photo.slot} photo already has a ${existingImage.state} moderation state.`,
        );
      if (old) {
        beforeImageStates.set(old.id, old.state);
        afterImageStates.set(old.id, "archived");
      }
      if (existingImage) {
        beforeImageStates.set(existingImage.id, existingImage.state);
        afterImageStates.set(existingImage.id, "accepted");
        continue;
      }
      beforeImageStates.set(imageId, "archived");
      afterImageStates.set(imageId, "accepted");
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
        const key = importPhotoKey(
          ids.product,
          snapshot.versionId,
          imageId,
          kind,
        );
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

    const retailerIds = [...new Set(built.input.retailerIds ?? [])];
    const currentRetailers = new Set(
      snapshot.retailers.map((retailer) => retailer.retailerId),
    );
    const missingRetailers = retailerIds.filter(
      (retailerId) => !currentRetailers.has(retailerId),
    );
    const now = this.clock();
    const sourceImageIds = [
      ...new Set(
        facts.transcription.readings.flatMap((reading) => reading.photosUsed),
      ),
    ]
      .map((name) => facts.photos.find((photo) => photo.name === name))
      .filter((photo): photo is ImportPhoto => !!photo)
      .map((photo) =>
        importImageId(facts.sourceKey, photo.slot, photo.full.sha256),
      );
    const classification = importClassification(facts);
    const classificationValue: FormulaClassification = {
      veganStatus: classification.veganStatus,
      manufacturerLabel: MANUFACTURER_LABEL[facts.packageLabel],
      evidence: {
        urls: facts.transcription.onlineSupplement
          ? [facts.transcription.onlineSupplement.url]
          : [],
        imageIds: facts.photos.map((photo) =>
          importImageId(facts.sourceKey, photo.slot, photo.full.sha256),
        ),
        note: importEvidenceNote(facts),
      },
      certifications: [],
      reviewedBy: classification.veganStatus === "vegan" ? actor.id : null,
      ingredientsChecked: classification.ingredientsChecked,
    };
    const transcription = this.transcriptionValue(facts, sourceImageIds, now);
    const before: CatalogPatch = {
      classification: {
        versionId: snapshot.versionId,
        value: snapshot.classification,
      },
      ingredientTranscription: {
        versionId: snapshot.versionId,
        value: snapshot.ingredientTranscription ?? null,
      },
      ...(beforeImageStates.size
        ? {
            imageStates: [...beforeImageStates].map(([id, state]) => ({
              id,
              state,
            })),
          }
        : {}),
      ...(missingRetailers.length
        ? {
            retailerLinks: missingRetailers.map((retailerId) => ({
              retailerId,
              stance: null,
            })),
          }
        : {}),
    };
    const after: CatalogPatch = {
      classification: {
        versionId: snapshot.versionId,
        value: classificationValue,
      },
      ingredientTranscription: {
        versionId: snapshot.versionId,
        value: transcription,
      },
      ...(afterImageStates.size
        ? {
            imageStates: [...afterImageStates].map(([id, state]) => ({
              id,
              state,
            })),
          }
        : {}),
      ...(missingRetailers.length
        ? {
            retailerLinks: missingRetailers.map((retailerId) => ({
              retailerId,
              stance: "confirm" as const,
            })),
          }
        : {}),
    };
    const allergens = importAllergenDeclaration(
      facts.transcription.allergens,
      target.allergens,
    );
    if (allergens) {
      before.allergens = {
        versionId: snapshot.versionId,
        value: snapshot.allergens
          ? {
              ...snapshot.allergens,
              ...(snapshot.allergenSource
                ? {
                    evidence: snapshot.allergenSource.evidence,
                    proposalId: snapshot.allergenSource.proposalId ?? undefined,
                  }
                : {}),
            }
          : null,
      };
      after.allergens = {
        versionId: snapshot.versionId,
        value: {
          ...allergens,
          evidence: {
            urls: [],
            imageIds: sourceImageIds,
            note: `Imported from the reviewed package label for ${facts.brand} ${facts.name}.`,
          },
        },
      };
    }

    const guard = {
      sql: `EXISTS(SELECT 1 FROM products p JOIN catalog_revisions r ON r.product_id=p.id JOIN product_versions v ON v.product_id=p.id AND v.is_current=1 WHERE p.id=? AND p.lifecycle_status='active' AND r.revision=? AND v.id=?)
        AND NOT EXISTS(SELECT 1 FROM contribution_receipts WHERE user_id=? AND operation=? AND idempotency_key=?)`,
      values: [
        ids.product,
        snapshot.revision,
        snapshot.versionId,
        receipt.userId,
        receipt.operation,
        receipt.key,
      ],
    };
    const note = `Reconciled reviewed store photos for ${facts.sourceKey} (run ${run.id}); the existing product and formula history were retained.`;
    try {
      await this.moderation.commit(
        {
          id: this.newId(),
          actor,
          kind: "product_import_reconciliation",
          targetId: ids.product,
          productId: ids.product,
          before,
          after,
          note,
          now,
        },
        guard,
        (fence) =>
          this.catalog.patchStatements(
            snapshot,
            after,
            actor,
            now,
            fence,
            undefined,
            images,
          ),
        receipt,
      );
    } catch (error) {
      const prior = await replay<{ productId: string }>(this.db, receipt);
      if (prior) return { status: "replayed", productId: ids.product };
      throw error;
    }
    return { status: "written", productId: ids.product, slug: snapshot.slug };
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
    if (earlier?.status === "replayed") return earlier;
    if (earlier?.status === "changed")
      return this.reconcileExistingProduct(actor, run, facts, target, read);
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
        classification: {
          ...importClassification(facts),
          // The owner imports only after reviewing the batch transcription and
          // its exception list. Vegan requires that operator review to be
          // recorded on the formula.
          reviewedBy:
            importClassification(facts).veganStatus === "vegan"
              ? actor.id
              : null,
        },
        images,
        ownerReviewedImport: true,
        ingredientTranscription: {
          packageIngredients: facts.transcription.ingredients ?? null,
          packageContains: facts.transcription.contains ?? null,
          packageMayContain: facts.transcription.mayContain ?? null,
          sourceImageIds: [
            ...new Set(
              facts.transcription.readings.flatMap(
                (reading) => reading.photosUsed,
              ),
            ),
          ]
            .map((name) => facts.photos.find((photo) => photo.name === name))
            .filter((photo): photo is NonNullable<typeof photo> => !!photo)
            .map(
              (photo) =>
                images.find((image) => image.slot === photo.slot)?.imageId,
            )
            .filter((imageId): imageId is string => !!imageId),
          readings: facts.transcription.readings,
          verification: facts.transcription.verification,
          assessment: facts.transcription.assessment,
          onlineIngredients:
            facts.transcription.onlineSupplement?.ingredients ?? null,
          onlineContains:
            facts.transcription.onlineSupplement?.contains ?? null,
          onlineMayContain:
            facts.transcription.onlineSupplement?.mayContain ?? null,
          onlineUrl: facts.transcription.onlineSupplement?.url ?? null,
          onlineAccessedAt:
            facts.transcription.onlineSupplement?.accessedAt ?? null,
          onlineProductMatch:
            facts.transcription.onlineSupplement?.productMatch ?? null,
        },
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

  private formulaReceipt(
    actor: Actor,
    update: ImportFormulaUpdate,
    now: number,
  ) {
    return receiptWrite(
      actor.id,
      FORMULA_IMPORT_OPERATION,
      importIds(update.facts.sourceKey).receiptKey,
      canonical(update),
      now,
    );
  }

  /** Read-only plan for a later formula attached to an imported identity. */
  async planFormulaUpdate(
    actor: Actor,
    update: ImportFormulaUpdate,
  ): Promise<ImportOutcome> {
    administrator(actor);
    const productId = importIds(update.productSourceKey).product;
    const nextVersionId = importIds(update.facts.sourceKey).version;
    const receipt = await this.formulaReceipt(actor, update, this.clock());
    try {
      if (await replay(this.db, receipt))
        return { status: "replayed", productId };
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.code === "IDEMPOTENCY_CONFLICT"
      )
        return { status: "changed", productId };
      throw error;
    }
    const existing = await this.db
      .prepare("SELECT lifecycle_status AS lifecycle FROM products WHERE id=?")
      .bind(productId)
      .first<{ lifecycle: string }>();
    // The first import run can plan the base product and its later formula
    // together; the write pass applies them in that order.
    if (!existing) return { status: "ready", productId, waitsForLine: false };
    if (existing.lifecycle !== "active")
      return blocked(productId, "Its existing product is not active.");
    const versionCollision = await this.db
      .prepare("SELECT 1 FROM product_versions WHERE id=? AND product_id=?")
      .bind(nextVersionId, productId)
      .first();
    if (versionCollision)
      return blocked(
        productId,
        "The later formula version exists without its import receipt.",
      );
    const snapshot = await this.moderation.snapshot(productId);
    const brand = await this.moderation.brandName(snapshot.brandId);
    if (
      !brand ||
      normalizeName(brand) !== normalizeName(update.facts.brand) ||
      normalizeName(snapshot.name) !== normalizeName(update.facts.name)
    )
      return blocked(productId, "Its product identity changed since review.");
    return { status: "ready", productId, waitsForLine: false };
  }

  /** Publish the later reviewed formula while retaining the earlier one. */
  async importFormulaUpdate(
    actor: Actor,
    run: { id: string; manifestHash: string },
    update: ImportFormulaUpdate,
    read: PhotoBytes,
  ): Promise<ImportOutcome> {
    administrator(actor);
    const productId = importIds(update.productSourceKey).product;
    const ids = importIds(update.facts.sourceKey);
    const earlier = await this.planFormulaUpdate(actor, update);
    if (earlier.status === "replayed" || earlier.status === "changed")
      return earlier;
    if (earlier.status === "blocked") return earlier;
    const snapshot = await this.moderation.snapshot(productId);
    const facts = update.facts;
    const countryAllergens = facts.transcription.allergens
      ? new Set(
          (
            await this.db
              .prepare(
                "SELECT allergen_key AS key FROM country_allergens WHERE country_id=?",
              )
              .bind(snapshot.countryId)
              .all<{ key: string }>()
          ).results.map(({ key }) => key),
        )
      : new Set<string>();
    const allergens = importAllergenDeclaration(
      facts.transcription.allergens,
      countryAllergens,
    );
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
            productId,
            `The formula's ${photo.slot} photo ${kind} copy changed since the manifest was built.`,
          );
        const key = importPhotoKey(productId, ids.version, imageId, kind);
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
    const sourceImageIds = [
      ...new Set(
        facts.transcription.readings.flatMap((reading) => reading.photosUsed),
      ),
    ]
      .map((name) => facts.photos.find((photo) => photo.name === name))
      .filter((photo): photo is ImportPhoto => !!photo)
      .map(
        (photo) => images.find((image) => image.slot === photo.slot)?.imageId,
      )
      .filter((imageId): imageId is string => !!imageId);
    const classification = importClassification(facts);
    const value: FormulaClassification = {
      ...classification,
      veganStatus: classification.veganStatus,
      manufacturerLabel: MANUFACTURER_LABEL[facts.packageLabel],
      evidence: {
        urls: facts.transcription.onlineSupplement
          ? [facts.transcription.onlineSupplement.url]
          : [],
        imageIds: [...new Set(images.map((image) => image.imageId))],
        note: importEvidenceNote(facts),
      },
      certifications: [],
      reviewedBy: classification.veganStatus === "vegan" ? actor.id : null,
    };
    const patch: CatalogPatch = {
      currentVersionId: ids.version,
      classification: { versionId: ids.version, value },
      ...(allergens
        ? {
            allergens: {
              versionId: ids.version,
              value: {
                ...allergens,
                evidence: {
                  urls: [],
                  imageIds: sourceImageIds,
                  note: `Imported from the reviewed package label for ${facts.brand} ${facts.name}.`,
                },
              },
            },
          }
        : {}),
    };
    const before: CatalogPatch = { currentVersionId: snapshot.versionId };
    const now = this.clock();
    const receipt = await this.formulaReceipt(actor, update, now);
    const note = `Imported a later formula from store photos: ${facts.sourceKey} (run ${run.id}).`;
    const guard = {
      sql: `NOT EXISTS(SELECT 1 FROM contribution_receipts WHERE user_id=? AND operation=? AND idempotency_key=?)
        AND EXISTS(SELECT 1 FROM products p JOIN product_versions v ON v.product_id=p.id AND v.is_current=1 WHERE p.id=? AND p.lifecycle_status='active' AND v.id=?)`,
      values: [
        receipt.userId,
        receipt.operation,
        receipt.key,
        productId,
        snapshot.versionId,
      ],
    };
    const transcription = this.db
      .prepare(
        `INSERT INTO product_version_ingredient_transcriptions(product_version_id,package_ingredients,package_contains,package_may_contain,source_image_ids,readings,verification,assessment,online_ingredients,online_contains,online_may_contain,online_url,online_accessed_at,online_product_match,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM moderation_actions WHERE id=?)`,
      )
      .bind(
        ids.version,
        facts.transcription.ingredients ?? null,
        facts.transcription.contains ?? null,
        facts.transcription.mayContain ?? null,
        JSON.stringify(sourceImageIds),
        JSON.stringify(facts.transcription.readings),
        facts.transcription.verification,
        JSON.stringify(facts.transcription.assessment),
        facts.transcription.onlineSupplement?.ingredients ?? null,
        facts.transcription.onlineSupplement?.contains ?? null,
        facts.transcription.onlineSupplement?.mayContain ?? null,
        facts.transcription.onlineSupplement?.url ?? null,
        facts.transcription.onlineSupplement?.accessedAt ?? null,
        facts.transcription.onlineSupplement?.productMatch ?? null,
        now,
        ids.action,
      );
    try {
      const result = await this.moderation.commit(
        {
          id: ids.action,
          actor,
          kind: "product_formula_import",
          targetId: productId,
          productId,
          before,
          after: patch,
          note,
          now,
        },
        guard,
        (fence) => [
          ...this.catalog.patchStatements(
            snapshot,
            patch,
            actor,
            now,
            fence,
            {
              id: ids.version,
              label: update.label,
              date: effectiveDate(),
              summary: update.summary,
            },
            images,
          ),
          transcription,
        ],
        receipt,
      );
      return {
        status: "written",
        productId,
        slug: snapshot.slug,
      };
    } catch (error) {
      const replayed = await replay<{ productId: string }>(this.db, receipt);
      if (replayed) return { status: "replayed", productId };
      if (
        error instanceof ApplicationError &&
        error.code === "IDEMPOTENCY_CONFLICT"
      )
        return { status: "changed", productId };
      throw error;
    }
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
