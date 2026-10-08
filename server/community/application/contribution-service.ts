import { ApplicationError } from "../../shared/domain/errors";
import type {
  Actor,
  ProductChange,
  ReportInput,
  RetailerInput,
} from "../domain/contracts";
import { active, effectiveDate } from "../domain/policy";
import { proposalBaseline } from "../domain/change-policy";
import { contributorProduct } from "../domain/moderation";
import { ContributionRepository } from "../infrastructure/contribution-repository";
import { receiptWrite } from "../infrastructure/receipts";
import { CommunityLookupRepository } from "../infrastructure/lookup-repository";
import type { ModerationRepository } from "../infrastructure/moderation-repository";

export class ContributionService {
  constructor(
    private readonly repository: ContributionRepository,
    private readonly lookup: CommunityLookupRepository,
    private readonly catalog: Pick<ModerationRepository, "snapshot">,
    private readonly newId: () => string,
    private readonly clock = Date.now,
  ) {}
  options(actor: Actor, query = "") {
    active(actor);
    return this.lookup.options(query);
  }
  /** The contributor-facing product state, without private moderation data. */
  async product(actor: Actor, productId: string) {
    active(actor);
    await this.lookup.contributableProduct(productId);
    return contributorProduct(await this.catalog.snapshot(productId));
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
    return this.repository.propose(
      actor,
      input,
      this.newId(),
      receipt,
      proposalBaseline(snapshot, input, slots),
    );
  }
  async proposeRetailer(actor: Actor, key: string, input: RetailerInput) {
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
    for (const name of [input.name, ...input.aliases])
      if (await this.repository.retailerExists(name))
        throw new ApplicationError(
          "RETAILER_EXISTS",
          "This name or alias already belongs to a retailer. Choose the existing entry.",
          409,
        );
    return this.repository.propose(actor, input, this.newId(), receipt);
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
