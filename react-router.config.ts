import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // With about 25 routes the whole list is cheap, and it saves an uncached
  // /__manifest request on every page load and after clicks.
  routeDiscovery: { mode: "initial" },
} satisfies Config;
