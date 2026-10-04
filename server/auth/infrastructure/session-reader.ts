import type { SessionReader } from "../application/session";
import { getAuth, profilesService } from "./auth";

export class BetterAuthSessionReader implements SessionReader {
  constructor(private readonly env: Cloudflare.Env) {}
  async getUser(headers: Headers) {
    const auth = await getAuth(this.env);
    const session = await auth.api.getSession({ headers });
    if (!session) return null;
    return {
      id: session.user.id,
      profile: await profilesService(this.env).ensureProfile(session.user.id),
    };
  }
}
