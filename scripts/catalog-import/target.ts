import { readFile } from "node:fs/promises";
import type {
  CatalogImportService,
  ImportStore,
  ImportTarget,
} from "../../server/community/application/catalog-import-service";
import type { Actor } from "../../server/community/domain/contracts";
import { normalizeName } from "../../server/community/domain/policy";

// The checks against one environment before anything is written
// (docs/IMPORTER_PLAN.md, "Checks before writing"), and the ids the import
// writes with there.

/** The environment's administrator allowlist: `.dev.vars` locally. */
export async function adminIds(
  environment: "local" | "staging",
  vars: Record<string, unknown>,
) {
  let value = String(vars.ADMIN_USER_IDS ?? "");
  if (environment === "local")
    try {
      const local = (await readFile(".dev.vars", "utf8")).match(
        /^ADMIN_USER_IDS=(.*)$/m,
      )?.[1];
      if (local !== undefined) value = local.replace(/^['"]|['"]$/g, "");
    } catch {
      /* no local overrides */
    }
  return value
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function checkTarget(
  db: D1Database,
  service: CatalogImportService,
  options: {
    operatorId: string;
    admins: string[];
    foods: string[];
    stores: ImportStore[];
  },
) {
  const blocking: string[] = [];
  const profile = await db
    .prepare("SELECT account_state FROM profiles WHERE user_id=?")
    .bind(options.operatorId)
    .first<string>("account_state");
  if (profile !== "active")
    blocking.push(
      `The operator ${options.operatorId} is not an active account here.`,
    );
  if (!options.admins.includes(options.operatorId))
    blocking.push(
      `The operator ${options.operatorId} is not in this environment's ADMIN_USER_IDS.`,
    );
  // The demo catalog is cleared before the import (owner decision 4).
  const demo = await db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM products WHERE development_only=1) AS products,(SELECT COUNT(*) FROM profiles WHERE handle LIKE 'demo\\_taster\\_%' ESCAPE '\\') AS tasters",
    )
    .first<{ products: number; tasters: number }>();
  if (demo?.products || demo?.tasters)
    blocking.push(
      `Demo data is present (${demo.products} demo products, ${demo.tasters} demo tasters). Clear it first.`,
    );
  const countryId = await db
    .prepare("SELECT id FROM countries WHERE iso2='US' AND is_active=1")
    .first<string>("id");
  if (!countryId) blocking.push("The United States is not an active country.");
  const rows = (
    await db
      .prepare(
        "SELECT c.id,c.slug,c.is_active AS active,c.is_rankable AS rankable,EXISTS(SELECT 1 FROM category_countries cc WHERE cc.category_id=c.id AND cc.country_id=?) AS here FROM categories c WHERE c.slug IN (SELECT value FROM json_each(?))",
      )
      .bind(countryId ?? "", JSON.stringify(options.foods))
      .all<{
        id: string;
        slug: string;
        active: number;
        rankable: number;
        here: number;
      }>()
  ).results;
  const foods = new Map<string, string>();
  for (const food of options.foods) {
    const row = rows.find((candidate) => candidate.slug === food);
    if (!row) blocking.push(`The food "${food}" is not in this database.`);
    else if (!row.active || !row.rankable)
      blocking.push(`The food "${food}" is not an active, rankable food.`);
    else if (!row.here)
      blocking.push(
        `The food "${food}" is not switched on in the United States.`,
      );
    else foods.set(food, row.id);
  }
  const storeIds = await service.storeIds(options.stores, "US");
  // Stores without a market here are added first, by the run.
  const pendingStores = new Set(
    options.stores
      .filter((store) => !storeIds.has(normalizeName(store.name)))
      .flatMap((store) => [store.name, ...store.aliases].map(normalizeName)),
  );
  const actor: Actor = {
    id: options.operatorId,
    accountState: "active",
    administrator: true,
  };
  const target: ImportTarget = { foods, stores: storeIds };
  return { blocking, actor, target, pendingStores, countryId };
}
