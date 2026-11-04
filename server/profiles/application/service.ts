import type { ModerationDecisionService } from "../../moderation/application/decision-service";
import {
  ApplicationError,
  assertActiveAccount,
} from "../../shared/domain/errors";
import {
  validateProfileSettings,
  type ProfilesRepository,
} from "../domain/profile";

export class ProfilesService {
  constructor(
    private readonly repository: ProfilesRepository,
    private readonly newId: () => string,
    private readonly clock = Date.now,
    private readonly decisions?: ModerationDecisionService,
  ) {}

  async ensureProfile(userId: string) {
    const existing = await this.repository.find(userId);
    if (existing) return existing;
    for (let attempt = 0; attempt < 10; attempt++) {
      // Provider names and email addresses are never made public automatically.
      const handle = `vegan_${this.newId().replaceAll("-", "").slice(-16)}`;
      const profile = await this.repository.tryCreate(
        userId,
        handle,
        this.clock(),
      );
      if (profile) return profile;
      const concurrent = await this.repository.find(userId);
      if (concurrent) return concurrent;
    }
    throw new ApplicationError(
      "PROFILE_UNAVAILABLE",
      "Your profile could not be created. Please try again.",
      503,
    );
  }

  async update(userId: string, input: { handle: string; displayName: string }) {
    const profile = await this.ensureProfile(userId);
    assertActiveAccount(profile);
    const settings = validateProfileSettings(input);
    if (
      profile.handle === settings.handle &&
      profile.displayName === settings.displayName
    )
      return profile;
    if (!(await this.repository.handleAvailable(settings.handle, userId)))
      throw new ApplicationError(
        "HANDLE_TAKEN",
        "That handle is already in use.",
        409,
      );
    if (this.decisions?.safetyEnabled) {
      const decision = await this.decisions.evaluate({
        kind: "content_safety",
        subject: { type: "profile", id: userId },
        userId,
        state: {},
        safety: {
          text: [settings.handle, settings.displayName]
            .filter(Boolean)
            .join("\n"),
        },
      });
      if (decision.status === "over_budget")
        throw new ApplicationError(
          decision.budgetScope === "account"
            ? "MODERATION_ACCOUNT_LIMIT"
            : "MODERATION_CAPACITY",
          "The profile check allowance is exhausted. Please try again later.",
          decision.budgetScope === "account" ? 429 : 503,
          Math.ceil((decision.retryAfterMs ?? 60_000) / 1000),
        );
      if (decision.status === "failed")
        throw new ApplicationError(
          "PROFILE_CHECK_UNAVAILABLE",
          "Your name could not be checked. Please try again later.",
          503,
        );
      if (decision.outcome === "BLOCKED")
        throw new ApplicationError(
          "PROFILE_NAME_BLOCKED",
          "Please choose another handle or display name. If this seems incorrect, contact us to appeal.",
          422,
        );
    }
    return this.repository.update(userId, settings, this.clock());
  }
}
