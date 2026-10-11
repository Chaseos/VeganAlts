import { v7 as uuid } from "uuid";
import { CloudflareImageTransformer } from "../../media/infrastructure/cloudflare-images";
import { communityLimits } from "../domain/policy";
import { autoApplyPolicy } from "../domain/confidence";
import { R2EvidenceStorage } from "./evidence-storage";
import { StagedMediaRepository } from "./staged-media-repository";
import { SubmissionRepository } from "./submission-repository";
import { CommunityLookupRepository } from "./lookup-repository";
import { ContributionRepository } from "./contribution-repository";
import { ModerationRepository } from "./moderation-repository";
import { CatalogDecisionRepository } from "./catalog-decision-repository";
import { QueueDecisionRepository } from "./queue-decision-repository";
import { DuplicateRepository } from "./duplicate-repository";
import { SubmissionService } from "../application/submission-service";
import { StagedMediaService } from "../application/staged-media-service";
import { ContributionService } from "../application/contribution-service";
import { ModerationService } from "../application/moderation-service";
import {
  moderationDecisions,
  type ModerationEnv,
} from "../../moderation/infrastructure/composition";
import { FoodSuggestions } from "../../taxonomy/application/food-suggestions";
import { D1TaxonomyRepository } from "../../taxonomy/infrastructure/d1-taxonomy-repository";

export function communityServices(
  env: Pick<Cloudflare.Env, "DB" | "MEDIA_BUCKET" | "IMAGES"> &
    Partial<Omit<ModerationEnv, "DB">> & {
      COMMUNITY_LIMITS?: string;
      PROPOSAL_AUTO_APPLY?: string;
    },
  newId: () => string = uuid,
  clock = Date.now,
) {
  const limits = communityLimits(env.COMMUNITY_LIMITS),
    lookup = new CommunityLookupRepository(env.DB);
  const staged = new StagedMediaRepository(env.DB, limits),
    receipts = new SubmissionRepository(env.DB, limits);
  const media = new StagedMediaService(
    staged,
    new R2EvidenceStorage(env.MEDIA_BUCKET),
    new CloudflareImageTransformer(env.IMAGES),
    newId,
    clock,
  );
  const decisions = moderationDecisions(
    { ...env, APP_ENV: env.APP_ENV ?? "local" },
    newId,
    clock,
  );
  const repository = new ModerationRepository(env.DB);
  // Foods suggested inside a submission pass the Suggest a food checks.
  const foods = new FoodSuggestions(
    new D1TaxonomyRepository(repository, newId),
    clock,
  );
  const submissions = new SubmissionService(
    receipts,
    lookup,
    staged,
    media,
    decisions,
    newId,
    clock,
    foods,
  );
  const contributionRepository = new ContributionRepository(env.DB, limits);
  const catalog = new CatalogDecisionRepository(repository),
    queue = new QueueDecisionRepository(repository, catalog, staged),
    duplicates = new DuplicateRepository(repository, catalog),
    autoApply = autoApplyPolicy(env.PROPOSAL_AUTO_APPLY);
  const moderation = new ModerationService(
    repository,
    catalog,
    queue,
    duplicates,
    receipts,
    submissions,
    media,
    decisions,
    autoApply,
    newId,
    clock,
  );
  return {
    lookup,
    media,
    submissions,
    contributions: new ContributionService(
      contributionRepository,
      lookup,
      repository,
      decisions,
      media,
      autoApply,
      (proposalId) => moderation.autoAccept(proposalId),
      newId,
      clock,
    ),
    moderation,
    repository,
    contributionRepository,
    decisions,
  };
}
