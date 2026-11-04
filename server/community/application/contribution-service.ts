import { contributedText } from "../../moderation/domain/safety";
import {
  ModerationWorkService,
  requireAutomatedCheck,
} from "../../moderation/application/work-service";
import { ApplicationError } from "../../shared/domain/errors";
import {
  responseInput,
  type Actor,
  type ProductChange,
  type ReportInput,
  type RetailerInput,
} from "../domain/contracts";
import {
  active,
  administrator,
  effectiveDate,
  identityKey,
} from "../domain/policy";
import { planProductChange, proposalBaseline } from "../domain/change-policy";
import { describeChange } from "../domain/change-summary";
import { contributorProduct } from "../domain/moderation";
import {
  checksIngredients,
  confidence,
  riskTier,
  type AutoApplyPolicy,
} from "../domain/confidence";
import type { ModerationDecisionService } from "../../moderation/application/decision-service";
import type { StagedMediaService } from "./staged-media-service";
import { ContributionRepository } from "../infrastructure/contribution-repository";
import { receiptWrite } from "../infrastructure/receipts";
import { CommunityLookupRepository } from "../infrastructure/lookup-repository";
import type { ModerationRepository } from "../infrastructure/moderation-repository";

export class ContributionService {
  constructor(
    private readonly repository: ContributionRepository,
    private readonly lookup: CommunityLookupRepository,
    private readonly catalog: Pick<
      ModerationRepository,
      "snapshot" | "brandName"
    >,
    private readonly decisions: ModerationDecisionService,
    private readonly media: Pick<
      StagedMediaService,
      "decisionImages" | "referenceImage"
    >,
    private readonly autoApply: AutoApplyPolicy,
    // Applies a tier 1 proposal through the audited system-actor path.
    private readonly accept: (proposalId: string) => Promise<unknown>,
    private readonly newId: () => string,
    private readonly clock = Date.now,
    private readonly work?: ModerationWorkService,
  ) {}
  options(actor: Actor, query = "", country = "US") {
    active(actor);
    return this.lookup.options(query, country);
  }
  /** The contributor-facing product state, without private moderation data. */
  async product(actor: Actor, productId: string) {
    active(actor);
    await this.lookup.contributableProduct(productId);
    const product = contributorProduct(await this.catalog.snapshot(productId));
    const ids = product.categories.map((category) => category.categoryId);
    const names = await this.lookup.categoryNames(ids);
    return {
      ...product,
      categoryNames: Object.fromEntries(
        ids.map((id, index) => [id, names[index]!]),
      ),
    };
  }
  async report(actor: Actor, key: string, input: ReportInput) {
    active(actor);
    const receipt = await receiptWrite(
      actor.id,
      "report",
      key,
      input,
      this.clock(),
    );
    const prior = await this.repository.replay<{ id: string }>(receipt);
    if (prior) return prior;
    await this.repository.target(input.targetType, input.targetId);
    return this.repository.report(actor, input, this.newId(), receipt);
  }
  async propose(actor: Actor, key: string, input: ProductChange) {
    active(actor);
    return this.work
      ? this.work.execute(actor.id, "proposal_create", key, input, () =>
          this.proposeNow(actor, key, input),
        )
      : this.proposeNow(actor, key, input);
  }
  private async proposeNow(actor: Actor, key: string, input: ProductChange) {
    active(actor);
    const receipt = await receiptWrite(
      actor.id,
      "proposal",
      key,
      input,
      this.clock(),
    );
    const prior = await this.repository.replay<{ id: string }>(receipt);
    if (prior) return prior;
    await this.lookup.contributableProduct(input.productId);
    if ("effectiveDate" in input) effectiveDate(input.effectiveDate);
    // The repository batch re-fences this revision, so the baseline recorded
    // with the proposal is exactly the state it was drafted against.
    const snapshot = await this.catalog.snapshot(input.productId);
    if (snapshot.revision !== input.expectedRevision)
      throw new ApplicationError(
        "STALE_PRODUCT",
        "The product changed. Review its current details before proposing this change.",
        409,
      );
    const slots = await this.repository.validateEvidence(
      actor,
      input,
      this.clock(),
    );
    if (
      input.kind === "category_add" &&
      !(await this.repository.rankableCategory(input.categoryId))
    )
      throw new ApplicationError(
        "INVALID_CATEGORY",
        "Choose an active replacement category.",
      );
    // Deterministic validity (no-op or invalid changes) before any model call.
    planProductChange(snapshot, input, actor.id, this.newId());
    const staged = input.evidenceReceiptId
      ? await this.media.decisionImages(input.evidenceReceiptId)
      : [];
    if (input.kind === "photo") {
      if (staged.length !== 1 || staged[0]!.slot !== input.slot)
        throw new ApplicationError(
          "EVIDENCE_REQUIRED",
          `Upload exactly one ${input.slot} photo for this proposal.`,
          409,
        );
      // The same photo proposed again for this slot counts as independent
      // support for the open proposal instead of a duplicate gallery entry.
      const duplicate = await this.repository.duplicatePhoto(
        input.productId,
        input.slot,
        staged[0]!.contentHash,
      );
      if (duplicate) {
        if (duplicate.submitted_by !== actor.id)
          await this.respond(actor, key, duplicate.id, {
            stance: "confirm",
            note: "Submitted the same photo independently.",
          });
        return { id: duplicate.id, duplicateOf: true };
      }
    }
    const id = this.newId(),
      tier = riskTier(input, snapshot, this.autoApply, slots);
    const reference =
      input.kind === "photo"
        ? await this.media.referenceImage(input.productId)
        : null;
    const automated = await this.decisions.evaluate({
      safety: { text: contributedText(input), images: staged },
      // Checking unchecked ingredients cites an already accepted label photo,
      // so its evidence is assessed like an allergen declaration's.
      kind:
        input.kind === "photo"
          ? "image"
          : checksIngredients(input, snapshot)
            ? "edit_proposal"
            : ["classification", "reformulation"].includes(input.kind)
              ? "formula_evidence"
              : "edit_proposal",
      subject: { type: "edit_proposal", id },
      userId: actor.id,
      state: {
        product: {
          brand: await this.catalog.brandName(snapshot.brandId),
          name: snapshot.name,
          aliases: snapshot.aliases,
          manufacturerUrl: snapshot.manufacturerUrl,
        },
        change: this.describe(input),
        evidence: { note: input.evidence.note, urls: input.evidence.urls },
        ...(input.kind === "photo"
          ? {
              images: [
                { position: 1, claimedSlot: input.slot },
                ...(reference
                  ? [{ position: 2, role: "current front photo" }]
                  : []),
              ],
            }
          : {}),
      },
      images:
        input.kind === "photo"
          ? [staged[0]!, ...(reference ? [reference] : [])]
          : staged.slice(0, 3),
      context:
        input.kind === "photo"
          ? { slots: [input.slot] }
          : { lowRisk: tier === 1 },
    });
    requireAutomatedCheck(automated);
    await this.work?.assertCurrent();
    // Actionable problems return before any proposal or evidence is reserved.
    if (
      automated.outcome === "NEEDS_CHANGES" ||
      automated.outcome === "BLOCKED"
    )
      throw new ApplicationError(
        automated.outcome === "BLOCKED"
          ? "PROPOSAL_BLOCKED"
          : "PROPOSAL_NEEDS_CHANGES",
        automated.reasons.join(" ") || "Check the evidence for this change.",
        422,
      );
    const saved = await this.repository.propose(
      actor,
      input,
      id,
      receipt,
      proposalBaseline(snapshot, input, slots),
      tier,
    );
    if (tier === 1 && automated.outcome === "READY")
      await this.accept(saved.id).catch(() => undefined);
    return saved;
  }
  /** A finite description of the change for the automated evidence check. */
  private describe(input: ProductChange) {
    const { evidence: _evidence, expectedRevision: _r, ...change } = input;
    return change;
  }
  async respond(actor: Actor, key: string, proposalId: string, raw: unknown) {
    active(actor);
    const input = responseInput.parse(raw),
      data = { proposalId, input };
    return this.work
      ? this.work.execute(actor.id, "proposal_response", key, data, () =>
          this.respondNow(actor, key, proposalId, input),
        )
      : this.respondNow(actor, key, proposalId, input);
  }
  private async respondNow(
    actor: Actor,
    key: string,
    proposalId: string,
    raw: unknown,
  ) {
    active(actor);
    const input = responseInput.parse(raw);
    const receipt = await receiptWrite(
      actor.id,
      `proposal-response-${proposalId}`,
      key,
      input,
      this.clock(),
    );
    const prior = await this.repository.replay<{
      proposalId: string;
      stance: string;
    }>(receipt);
    if (prior) return prior;
    await this.repository.assertResponseAllowed(proposalId, actor);
    if (input.note || input.urls.length) {
      const decision = await this.decisions.evaluate({
        kind: "content_safety",
        subject: { type: "proposal_response", id: `${proposalId}:${actor.id}` },
        userId: actor.id,
        state: {},
        safety: { text: contributedText(input) },
      });
      requireAutomatedCheck(decision);
      if (decision.outcome === "BLOCKED")
        throw new ApplicationError(
          "RESPONSE_BLOCKED",
          decision.reasons.join(" "),
          422,
        );
    }
    await this.work?.assertCurrent();
    return this.repository.respond(
      proposalId,
      actor,
      input.stance,
      input.note,
      input.urls,
      receipt,
      this.work?.context,
    );
  }
  async openProposals(actor: Actor, productId: string) {
    active(actor);
    await this.lookup.contributableProduct(productId);
    const rows = await this.repository.openProposals(productId, actor.id);
    const changes = rows.map(
      (p) => JSON.parse(p.proposedData) as ProductChange,
    );
    const categoryIds = changes.flatMap((c) =>
      c.kind === "category_add" ? [c.categoryId] : [],
    );
    const labels = await this.lookup.categoryNames(categoryIds);
    const categoryNames = Object.fromEntries(
      categoryIds.map((id, i) => [id, labels[i]!]),
    );
    return rows.map((p, index) => {
      const proposed = changes[index]!;
      return {
        summary: describeChange(proposed, categoryNames),
        imageIds: proposed.evidence.imageIds,
        id: p.id,
        kind: p.kind,
        tier: p.tier,
        note: p.note,
        createdAt: p.createdAt,
        own: p.own === 1,
        stance: p.stance,
        confirms: p.confirms,
        disagrees: p.disagrees,
        evidence: p.evidence,
        confidence: confidence(p.confirms, p.disagrees),
        change: this.describe(proposed),
        evidenceUrls: proposed.evidence.urls,
        evidenceReceiptId: proposed.evidenceReceiptId ?? null,
      };
    });
  }
  async proposeRetailer(actor: Actor, key: string, input: RetailerInput) {
    active(actor);
    return this.work
      ? this.work.execute(actor.id, "retailer_proposal", key, input, () =>
          this.proposeRetailerNow(actor, key, input),
        )
      : this.proposeRetailerNow(actor, key, input);
  }
  /** Trusted store data in an administrator-reviewed catalog import. */
  async proposeImportedRetailer(
    actor: Actor,
    key: string,
    input: RetailerInput,
  ) {
    administrator(actor);
    return this.proposeRetailerNow(actor, key, input, true);
  }
  private async proposeRetailerNow(
    actor: Actor,
    key: string,
    input: RetailerInput,
    trustedImport = false,
  ) {
    active(actor);
    const receipt = await receiptWrite(
      actor.id,
      "retailer-proposal",
      key,
      input,
      this.clock(),
    );
    const prior = await this.repository.replay<{ id: string }>(receipt);
    if (prior) return prior;
    const proposalId = this.newId();
    if (!(await this.repository.countryActive(input.country)))
      throw new ApplicationError(
        "INVALID_COUNTRY",
        "Choose an active country for this retailer.",
      );
    for (const name of [input.name, ...input.aliases]) {
      const existing = await this.repository.retailerExists(name);
      if (!existing) continue;
      // A known retailer already sold in this country is chosen, not proposed.
      if (await this.repository.retailerHasMarket(existing.id, input.country))
        throw new ApplicationError(
          "RETAILER_EXISTS",
          "This name or alias already belongs to a retailer here. Choose the existing entry.",
          409,
        );
      // Otherwise this proposes that retailer's market in this country.
      if (!trustedImport) await this.checkRetailer(actor, input, proposalId);
      return this.repository.propose(
        actor,
        { ...input, marketFor: existing.id },
        proposalId,
        receipt,
      );
    }
    if (!trustedImport) await this.checkRetailer(actor, input, proposalId);
    return this.repository.propose(actor, input, proposalId, receipt);
  }
  private async checkRetailer(
    actor: Actor,
    input: RetailerInput,
    proposalId: string,
  ) {
    const decision = await this.decisions.evaluate({
      kind: "content_safety",
      subject: { type: "edit_proposal", id: proposalId },
      userId: actor.id,
      state: {},
      safety: { text: contributedText(input) },
    });
    requireAutomatedCheck(decision);
    if (decision.outcome === "BLOCKED")
      throw new ApplicationError(
        "RETAILER_BLOCKED",
        decision.reasons.join(" "),
        422,
      );
    await this.work?.assertCurrent();
  }
  async confirm(
    actor: Actor,
    key: string,
    input: {
      productId: string;
      retailerId: string;
      stance: "confirm" | "not_current";
    },
  ) {
    active(actor);
    const receipt = await receiptWrite(
      actor.id,
      "retailer-confirmation",
      key,
      input,
      this.clock(),
    );
    const prior = await this.repository.replay<typeof input>(receipt);
    if (prior) return prior;
    return this.repository.confirm(
      actor,
      input.productId,
      input.retailerId,
      input.stance,
      receipt,
    );
  }
}
