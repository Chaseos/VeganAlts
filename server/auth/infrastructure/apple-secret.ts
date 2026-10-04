import { importPKCS8, SignJWT } from "jose";

export interface AppleCredentials {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

// Shorter than Apple's six-month maximum. Each warm isolate renews a day before
// expiry; cold starts mint a fresh JWT. No monthly manual secret rotation needed.
export class AppleClientSecret {
  private cached?: { token: string; expiresAt: number };
  constructor(
    private readonly credentials: AppleCredentials,
    private readonly clock = Date.now,
  ) {}

  async get() {
    const now = Math.floor(this.clock() / 1000);
    if (this.cached && this.cached.expiresAt - now > 86400)
      return this.cached.token;
    const key = await importPKCS8(
      this.credentials.privateKey.replaceAll("\\n", "\n"),
      "ES256",
    );
    const expiresAt = now + 30 * 86400;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.credentials.keyId })
      .setIssuer(this.credentials.teamId)
      .setSubject(this.credentials.clientId)
      .setAudience("https://appleid.apple.com")
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(key);
    this.cached = { token, expiresAt };
    return token;
  }
}
