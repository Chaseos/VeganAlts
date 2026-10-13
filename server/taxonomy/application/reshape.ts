import type { Actor } from "../../community/domain/contracts";
import { taxonomyShape } from "../domain/shape";
import type { TaxonomyService } from "./taxonomy-service";

export interface ShapeTarget {
  slug: string;
  parent: string | null;
  rankable: boolean;
}

/**
 * Moves existing categories into the launch tree (Food → aisle → food,
 * milestone 7) through the audited, reversible update path, top-down so each
 * aisle sits under Food before its foods move, then retires the groups the
 * tree no longer has once they are empty (the milestone 5 shelves and the
 * Meat and Dairy aisles). Run the taxonomy seed first so every group exists;
 * a second run makes no changes.
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
  if (problems.length)
    return { problems, moves: [], actions: [], retired: [], outside: [] };
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
        `m7-reshape-${move.slug}-${move.to ?? "root"}`,
        move.id,
        {
          expectedRevision: fresh.revision,
          parentId: move.parentId,
          note: `Milestone 7 two-level taxonomy: ${move.slug} moves under ${move.to ?? "the root"}.`,
        },
      )) as { actionId: string };
      actions.push({ slug: move.slug, actionId: result.actionId });
    }
  // Groups the tree no longer names are retired once nothing active sits
  // under them, deepest first so a shelf goes before its old aisle. Parents
  // are read as if the planned moves were made, so a dry run reports the same
  // retirements a real run makes.
  const wanted = new Set(targets.map((item) => item.slug));
  const parentOf = new Map(tree.categories.map((c) => [c.id, c.parentId]));
  for (const move of moves) parentOf.set(move.id, move.parentId);
  const depth = taxonomyShape(
    tree.categories
      .filter((c) => c.isActive)
      .map((c) => ({ ...c, parentId: parentOf.get(c.id) ?? null })),
  );
  const stale = tree.categories
    .filter(
      (c) =>
        c.isActive &&
        !c.isRankable &&
        parentOf.get(c.id) !== null &&
        !wanted.has(c.slug),
    )
    .sort(
      (a, b) => (depth.get(b.id)?.depth ?? 0) - (depth.get(a.id)?.depth ?? 0),
    );
  const retired = new Set<string>();
  for (const group of stale) {
    const occupied = tree.categories.some(
      (c) =>
        c.isActive && !retired.has(c.id) && parentOf.get(c.id) === group.id,
    );
    if (occupied) continue;
    retired.add(group.id);
    if (!apply) continue;
    const fresh = (await service.tree(actor)).categories.find(
      (c) => c.id === group.id,
    )!;
    const result = (await service.update(
      actor,
      `m7-retire-${group.slug}`,
      group.id,
      {
        expectedRevision: fresh.revision,
        isActive: false,
        note: `Milestone 7 two-level taxonomy: ${group.slug} is no longer a level.`,
      },
    )) as { actionId: string };
    actions.push({ slug: group.slug, actionId: result.actionId });
  }
  const after = await service.tree(actor);
  const shape = taxonomyShape(after.categories.filter((c) => c.isActive));
  return {
    problems,
    moves: moves.map(({ slug, from, to }) => ({ slug, from, to })),
    actions,
    retired: stale.filter((c) => retired.has(c.id)).map((c) => c.slug),
    // Rankable foods the aisle bar cannot place; review them by hand.
    outside: after.categories
      .filter((c) => c.isActive && shape.get(c.id)?.outsideDepth)
      .map((c) => c.slug),
  };
}
