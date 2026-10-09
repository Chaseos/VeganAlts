import { config } from "zod";

// The CSP forbids eval. Without this, Zod probes `new Function` when the first
// object schema is defined, which browsers report as a CSP violation. The root
// route imports this first so it runs before any route module defines schemas.
config({ jitless: true });
