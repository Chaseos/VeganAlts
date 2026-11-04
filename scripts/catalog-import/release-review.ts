import { z } from "zod";
import {
  importFacts,
  importManifestHash,
  type ImportManifest,
} from "../../server/community/domain/catalog-import";
import {
  fingerprint,
  normalizeName,
} from "../../server/community/domain/policy";

/** A separate, owner-reviewed overlay. Source batches and their history are never edited. */
export const releaseReview = z
  .object({
    version: z.literal(1),
    sourceManifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    scope: z.literal("animal-original-imitation-with-vegan-preparation"),
    decisions: z.array(
      z
        .object({
          sourceKey: z.string().min(3),
          decision: z.enum([
            "exclude",
            "hold",
            "retain",
            "reclassify",
            "duplicate",
          ]),
          survivorSourceKey: z.string().min(3).optional(),
          reason: z.string().trim().min(8),
          evidence: z.array(z.string().url()).default([]),
          food: z.string().min(1).optional(),
          // A dish with a different base recipe becomes its own line; existing
          // flavors stay as photographed.
          lineName: z.string().trim().min(1).max(120).optional(),
          separateLine: z.boolean().optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type ReleaseReview = z.infer<typeof releaseReview>;

export async function applyReleaseReview(source: ImportManifest, raw: unknown) {
  const review = releaseReview.parse(raw);
  if (
    review.sourceManifestHash !== source.hash ||
    source.hash !== (await importManifestHash(source))
  )
    throw new Error(
      "The release review belongs to a different source manifest. Review the changed source before importing.",
    );
  const bySource = new Map(source.products.map((p) => [p.facts.sourceKey, p]));
  const decisions = new Map(review.decisions.map((d) => [d.sourceKey, d]));
  if (decisions.size !== review.decisions.length)
    throw new Error("A product has more than one release decision.");
  for (const decision of review.decisions) {
    if (!bySource.has(decision.sourceKey))
      throw new Error(`Unknown release source: ${decision.sourceKey}`);
    if (
      decision.decision === "reclassify" &&
      (!decision.food ||
        Boolean(decision.lineName) !== Boolean(decision.separateLine))
    )
      throw new Error(
        "A reclassification needs a food; a new line needs both separateLine and lineName.",
      );
    if (decision.decision === "duplicate") {
      const survivor = decision.survivorSourceKey;
      if (
        !survivor ||
        survivor === decision.sourceKey ||
        !bySource.has(survivor) ||
        ["hold", "exclude", "duplicate"].includes(
          decisions.get(survivor)?.decision ?? "",
        )
      )
        throw new Error(
          `A duplicate needs a retained survivor: ${decision.sourceKey}`,
        );
    } else if (decision.survivorSourceKey)
      throw new Error("Only a duplicate can name a survivor.");
    if (
      decision.decision !== "reclassify" &&
      (decision.food || decision.lineName || decision.separateLine)
    )
      throw new Error(
        `Only a reclassification can change product facts: ${decision.sourceKey}`,
      );
  }
  const products = source.products.flatMap((product) => {
    const d = decisions.get(product.facts.sourceKey);
    if (
      d?.decision === "exclude" ||
      d?.decision === "hold" ||
      d?.decision === "duplicate"
    )
      return [];
    const facts = structuredClone(product.facts);
    if (d?.decision === "reclassify") {
      if (d.food) facts.food = d.food;
      if (d.lineName) facts.line.name = d.lineName;
      // Preserve intentional separations from the source, even if two names
      // match. Food changes split an existing line only at the food boundary.
      facts.line.key = `${facts.line.key}|release:${facts.food}:${normalizeName(facts.line.name)}${d.separateLine ? `:${facts.sourceKey}` : ""}`;
    }
    return [{ ...product, facts }];
  });
  if (!products.length)
    throw new Error("The release manifest has no eligible products.");
  const groups = new Map<string, typeof products>();
  for (const p of products)
    groups.set(p.facts.line.key, [...(groups.get(p.facts.line.key) ?? []), p]);
  for (const members of groups.values()) {
    const first = members.find((p) => !p.facts.flavor) ?? members[0]!;
    const flavors = members.map((p) => normalizeName(p.facts.flavor ?? ""));
    if (new Set(flavors).size !== flavors.length)
      throw new Error(
        `Release line has repeated flavors: ${first.facts.line.name}`,
      );
    for (const p of members)
      p.facts = importFacts.parse({
        ...p.facts,
        line: { ...p.facts.line, first: first.facts.sourceKey },
      });
  }
  const retained = new Map(products.map((p) => [p.facts.sourceKey, p.facts]));
  const formulaUpdates = source.formulaUpdates.flatMap((update) => {
    const product = retained.get(update.productSourceKey);
    if (!product) return [];
    return [
      {
        ...update,
        facts: importFacts.parse({
          ...update.facts,
          food: product.food,
          line: product.line,
          flavor: product.flavor,
        }),
      },
    ];
  });
  const manifest = { ...source, products, formulaUpdates };
  manifest.hash = await importManifestHash(manifest);
  return { manifest, review, reviewHash: await fingerprint(review) };
}
