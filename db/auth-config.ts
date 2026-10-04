import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";

// Schema generation only. The CLI reads the adapter metadata without connecting.
// Keep provider-independent table options aligned with the runtime auth factory.
export const auth = betterAuth({
  database: drizzleAdapter({}, { provider: "sqlite" }),
});
