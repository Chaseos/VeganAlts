import type { Actor } from "../../community/domain/contracts";
import { taxonomyShape } from "../domain/shape";
import type { TaxonomyService } from "./taxonomy-service";

export interface ShapeTarget {
  slug: string;
  parent: string | null;
  rankable: boolean;
}

/**
 * Moves existing categories into the launch tree (Food → aisle → shelf →
 * food) through the audited, reversible update path, top-down so each aisle
 * sits under Food before its shelves move. Run the taxonomy seed first so
 * every group exists; a second run makes no moves.
 */
export async function reshapeTaxonomy(
  service: TaxonomyService,
  actor: Actor,
  targets: ShapeTarget[],
  apply: boolean,
) {
  const tree = await service.tree(actor);
  const bySlug = new Map(tree.categories.map((c) => [c.slug, c]));
  const problems: string[] = [];
  for (const item of targets) {
    const found = bySlug.get(item.slug);
    if (!found)
      problems.push(`${item.slug} is missing; run the taxonomy seed first`);
    else if (!found.isActive) problems.push(`${item.slug} is retired`);
    else if (!!found.isRankable !== item.rankable)
      problems.push(
        `${item.slug} should ${item.rankable ? "" : "not "}be rankable`,
      );
  }
  if (tree.merges.some((merge) => merge.state !== "complete"))
    problems.push("a category merge is unfinished");
  if (problems.length) return { problems, moves: [], actions: [], outside: [] };
  const moves = targets.flatMap((item) => {
    const current = bySlug.get(item.slug)!;
    const parentId = item.parent ? bySlug.get(item.parent)!.id : null;
    return current.parentId === parentId
      ? []
      : [
          {
            slug: item.slug,
            id: current.id,
            from:
              tree.categories.find((c) => c.id === current.parentId)?.slug ??
              null,
            to: item.parent,
            parentId,
          },
        ];
  });
  const actions: { slug: string; actionId: string }[] = [];
  if (apply)
    for (const move of moves) {
      const fresh = (await service.tree(actor)).categories.find(
        (c) => c.id === move.id,
      )!;
      const result = (await service.update(
        actor,
        `m5-reshape-${move.slug}-${move.to ?? "root"}`,
        move.id,
        {
          expectedRevision: fresh.revision,
          parentId: move.parentId,
          note: `Milestone 5 three-level taxonomy: ${move.slug} moves under ${move.to ?? "the root"}.`,
        },
      )) as { actionId: string };
      actions.push({ slug: move.slug, actionId: result.actionId });
    }
  const after = await service.tree(actor);
  const shape = taxonomyShape(after.categories.filter((c) => c.isActive));
  return {
    problems,
    moves: moves.map(({ slug, from, to }) => ({ slug, from, to })),
    actions,
    // Rankable foods the aisle bar cannot place; review them by hand.
    outside: after.categories
      .filter((c) => c.isActive && shape.get(c.id)?.outsideDepth)
      .map((c) => c.slug),
  };
}
