import { spawnSync } from "node:child_process";

const environment = process.argv[2];
if (!["local", "staging", "production"].includes(environment ?? ""))
  throw new Error("Choose local, staging, or production explicitly.");
const remote = environment !== "local";
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--config",
    "wrangler.jsonc",
    ...(remote ? ["--remote", "--env", environment!] : ["--local", "--env="]),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
