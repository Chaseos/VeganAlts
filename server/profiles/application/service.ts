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
    return this.repository.update(
      userId,
      validateProfileSettings(input),
      this.clock(),
    );
  }
}
