import { ApplicationError } from "../../shared/domain/errors";

export interface Profile {
  userId: string;
  handle: string;
  displayName: string | null;
  accountState: string;
}
const reserved = new Set([
  "admin",
  "administrator",
  "api",
  "account",
  "support",
  "veganalts",
  "moderator",
  "system",
  "root",
]);

export function validateProfileSettings(input: {
  handle: string;
  displayName: string;
}) {
  const handle = input.handle.trim().toLowerCase();
  const displayName = input.displayName.trim();
  if (!/^[a-z][a-z0-9_]{2,29}$/.test(handle) || reserved.has(handle)) {
    throw new ApplicationError(
      "INVALID_HANDLE",
      "Use 3–30 letters, numbers or underscores, starting with a letter. This handle must not be reserved.",
    );
  }
  if (
    [...displayName].length > 60 ||
    /[\u0000-\u001f\u007f]/.test(displayName)
  ) {
    throw new ApplicationError(
      "INVALID_DISPLAY_NAME",
      "Use a display name of up to 60 characters.",
    );
  }
  return { handle, displayName: displayName || null };
}

export interface ProfilesRepository {
  find(userId: string): Promise<Profile | null>;
  tryCreate(
    userId: string,
    handle: string,
    now: number,
  ): Promise<Profile | null>;
  update(
    userId: string,
    settings: { handle: string; displayName: string | null },
    now: number,
  ): Promise<Profile>;
}
