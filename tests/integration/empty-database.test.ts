import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { expect, it } from "vitest";
import { catalogFixture } from "./fixtures";
import { emptyDatabase } from "../../db/empty-database";

const objects = () =>
  env.DB.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  ).first<number>("n");

// A database still on another history is emptied and migrated to version 1.
it("empties a populated database so the migrations recreate it", async () => {
  const before = await objects();
  await catalogFixture(env.DB, 2);
  expect(await emptyDatabase(env.DB)).toBeGreaterThan(0);
  expect(await objects()).toBe(0);

  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  expect(await objects()).toBe(before);
  expect(
    await env.DB.prepare("SELECT COUNT(*) AS n FROM allergens").first("n"),
  ).toBe(15);
  expect(
    (await env.DB.prepare("PRAGMA foreign_key_check").all()).results,
  ).toEqual([]);
});
