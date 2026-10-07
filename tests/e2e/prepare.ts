import { access, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { ensureBrowserOperator } from "./session-fixture";

if (!process.env.TEST_BASE_URL) {
  try {
    await access(".dev.vars");
  } catch {
    await writeFile(
      ".dev.vars",
      `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\n`,
      { mode: 0o600, flag: "wx" },
    );
  }
  for (const script of [
    "db:migrate:local",
    "db:seed:local",
    "db:seed-images:local",
  ]) {
    const result = spawnSync("npm", ["run", script], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    if (result.status !== 0)
      throw new Error(`${script} failed: ${result.stderr.slice(-2000)}`);
  }
  console.log(
    "Local migrations, demo catalog, aggregates and images are ready.",
  );
  await ensureBrowserOperator();
}
