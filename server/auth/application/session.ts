import type { Profile } from "../../profiles/domain/profile";
import {
  ApplicationError,
  assertActiveAccount,
} from "../../shared/domain/errors";

export interface CurrentUser {
  id: string;
  profile: Profile;
}
export interface SessionReader {
  getUser(headers: Headers): Promise<CurrentUser | null>;
}

export async function getOptionalUser(
  request: Request,
  sessions: SessionReader,
) {
  return sessions.getUser(request.headers);
}

export async function requireUser(request: Request, sessions: SessionReader) {
  const user = await getOptionalUser(request, sessions);
  if (!user)
    throw new ApplicationError("UNAUTHENTICATED", "Sign in to continue.", 401);
  assertActiveAccount(user.profile);
  return user;
}

export async function requireAdministrator(
  request: Request,
  sessions: SessionReader,
  allowedUserIds: string,
) {
  const user = await requireUser(request, sessions);
  if (
    !allowedUserIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(user.id)
  ) {
    throw new ApplicationError(
      "FORBIDDEN",
      "Administrator access is required.",
      403,
    );
  }
  return user;
}
