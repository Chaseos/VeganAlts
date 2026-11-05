import { CommunityLookupRepository } from "../../server/community/infrastructure/lookup-repository";
import { type Batch, result, runFile, writeJson } from "./batch";
import { loadRun } from "./view";

// `match`: checks each product against the catalog with the Add a product
// form's own duplicate rules. Read-only.

export async function match(batch: Batch, environment: "local" | "staging") {
  const { views } = await loadRun(batch);
  // Loaded only here: the platform proxy starts wrangler.
  const { withCatalogPlatform } = await import("../catalog-platform");
  const matches = await withCatalogPlatform(environment, async ({ DB }) => {
    const lookup = new CommunityLookupRepository(DB);
    const found: Record<
      string,
      {
        environment: string;
        brand: string;
        name: string;
        candidates?: { name: string; brand: string | null; exact: boolean }[];
        error?: string;
      }
    > = {};
    for (const view of views) {
      const input = {
        name: view.name,
        brand: view.brand,
        country: "US",
        categoryIds: [],
      };
      try {
        const candidates = await lookup.candidates(
          input,
          await lookup.context(input),
        );
        found[view.id] = {
          environment,
          brand: view.brand,
          name: view.name,
          candidates: candidates.map(({ name, brand, exact }) => ({
            name,
            brand,
            exact,
          })),
        };
      } catch (error) {
        found[view.id] = {
          environment,
          brand: view.brand,
          name: view.name,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return found;
  });
  await writeJson(runFile(batch, "matches.json"), matches);
  const exact = Object.values(matches).filter((entry) =>
    entry.candidates?.some((candidate) => candidate.exact),
  ).length;
  console.log(
    `Checked ${views.length} products against ${environment}: ${exact} already listed.`,
  );
  result({ ok: true, checked: views.length, existing: exact });
}
