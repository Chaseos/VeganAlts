import { v7 as uuid } from "uuid";
import { CloudflareImageTransformer } from "../../media/infrastructure/cloudflare-images";
import { communityLimits } from "../domain/policy";
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

export function communityServices(
  env: Pick<Cloudflare.Env, "DB" | "MEDIA_BUCKET" | "IMAGES"> & {
    COMMUNITY_LIMITS?: string;
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
  const submissions = new SubmissionService(
    receipts,
    lookup,
    staged,
    media,
    newId,
    clock,
  );
  const contributionRepository = new ContributionRepository(env.DB, limits);
  const repository = new ModerationRepository(env.DB),
    catalog = new CatalogDecisionRepository(repository),
    queue = new QueueDecisionRepository(repository, catalog, staged),
    duplicates = new DuplicateRepository(repository, catalog);
  return {
    lookup,
    media,
    submissions,
    contributions: new ContributionService(
      contributionRepository,
      lookup,
      repository,
      newId,
      clock,
    ),
    moderation: new ModerationService(
      repository,
      catalog,
      queue,
      duplicates,
      receipts,
      submissions,
      media,
      newId,
      clock,
    ),
    repository,
    contributionRepository,
  };
}
