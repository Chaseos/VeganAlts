import { betterAuth } from "better-auth";
import { dash } from "@better-auth/infra";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { drizzle } from "drizzle-orm/d1";
import { v7 as uuid } from "uuid";
import * as authSchema from "../../../db/schema/auth";
import { ProfilesService } from "../../profiles/application/service";
import { DrizzleProfilesRepository } from "../../profiles/infrastructure/drizzle-repository";
import { ApplicationError } from "../../shared/domain/errors";
import { AppleClientSecret } from "./apple-secret";

export function profilesService(env: Pick<Cloudflare.Env, "DB">) {
  return new ProfilesService(new DrizzleProfilesRepository(env.DB), uuid);
}

export function configuredProviders(env: Cloudflare.Env) {
  const providers: ("google" | "apple")[] = [];
  if (
    (env.BETTER_AUTH_SECRET?.length ?? 0) >= 32 &&
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET
  )
    providers.push("google");
  if (
    (env.BETTER_AUTH_SECRET?.length ?? 0) >= 32 &&
    env.APPLE_CLIENT_ID &&
    env.APPLE_TEAM_ID &&
    env.APPLE_KEY_ID &&
    env.APPLE_PRIVATE_KEY
  )
    providers.push("apple");
  return providers;
}

const factories = new WeakMap<
  Cloudflare.Env,
  {
    apple?: AppleClientSecret;
    appleToken?: string;
    auth?: ReturnType<typeof createAuth>;
  }
>();

export async function getAuth(env: Cloudflare.Env) {
  if (!env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new ApplicationError(
      "AUTH_UNAVAILABLE",
      "Sign-in is being prepared. Please try again later.",
      503,
    );
  }
  let state = factories.get(env);
  if (!state) {
    state = {};
    if (
      env.APPLE_CLIENT_ID &&
      env.APPLE_TEAM_ID &&
      env.APPLE_KEY_ID &&
      env.APPLE_PRIVATE_KEY
    ) {
      state.apple = new AppleClientSecret({
        clientId: env.APPLE_CLIENT_ID,
        teamId: env.APPLE_TEAM_ID,
        keyId: env.APPLE_KEY_ID,
        privateKey: env.APPLE_PRIVATE_KEY,
      });
    }
    factories.set(env, state);
  }
  const appleToken = await state.apple?.get();
  if (!state.auth || state.appleToken !== appleToken) {
    state.auth = createAuth(env, appleToken);
    state.appleToken = appleToken;
  }
  return state.auth;
}

function createAuth(env: Cloudflare.Env, appleToken?: string) {
  const profiles = profilesService(env);
  return betterAuth({
    appName: "VeganAlts",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema: authSchema }), {
      provider: "sqlite",
      schema: authSchema,
      transaction: false,
    }),
    trustedOrigins: [env.APP_URL, "https://appleid.apple.com"],
    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(appleToken && env.APPLE_CLIENT_ID
        ? { apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: appleToken } }
        : {}),
    },
    plugins: env.BETTER_AUTH_API_KEY
      ? [
          dash({
            apiKey: env.BETTER_AUTH_API_KEY,
            activityTracking: { enabled: false },
            managedDirectorySync: { enabled: false },
          }),
        ]
      : [],
    session: {
      expiresIn: 30 * 86400,
      updateAge: 86400,
      cookieCache: { enabled: false },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google", "apple"] },
      encryptOAuthTokens: true,
    },
    advanced: {
      database: { generateId: () => uuid() },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: { enabled: true, window: 60, max: 60 },
    logger: {
      level: "error",
      log(level) {
        console.error(JSON.stringify({ event: "auth_library", level }));
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await profiles.ensureProfile(user.id);
          },
        },
      },
    },
  });
}
