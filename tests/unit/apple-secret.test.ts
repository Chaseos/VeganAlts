import { expect, it } from "vitest";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { AppleClientSecret } from "../../server/auth/infrastructure/apple-secret";

it("signs the Apple claims and renews a cached secret before expiration", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256", {
    extractable: true,
  });
  let now = Date.now();
  const secrets = new AppleClientSecret(
    {
      clientId: "com.veganalts.test",
      teamId: "TESTTEAM",
      keyId: "TESTKEY",
      privateKey: await exportPKCS8(privateKey),
    },
    () => now,
  );
  const first = await secrets.get();
  expect(await secrets.get()).toBe(first);
  const verified = await jwtVerify(first, publicKey, {
    issuer: "TESTTEAM",
    subject: "com.veganalts.test",
    audience: "https://appleid.apple.com",
  });
  expect(verified.protectedHeader.kid).toBe("TESTKEY");
  expect(verified.payload.exp! - verified.payload.iat!).toBe(30 * 86400);
  now += 29 * 86400_000;
  expect(await secrets.get()).not.toBe(first);
});
