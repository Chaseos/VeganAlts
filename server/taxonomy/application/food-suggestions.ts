import { ApplicationError } from "../../shared/domain/errors";
import type { Actor } from "../../community/domain/contracts";
import {
  assertCategorySlug,
  categoryKey,
  categorySlug,
  invalidCountry,
} from "../domain/taxonomy";
import type { D1TaxonomyRepository } from "../infrastructure/d1-taxonomy-repository";

/** Food suggestions per contributor per UTC day, standalone or inline. */
export const PROPOSALS_PER_DAY = 3;

/**
 * Who a category's name must differ from. Foods (rankable) share one namespace
 * with every food name and alias; an aisle or shelf only needs a name unique
 * among its siblings, so the Eggs aisle can hold an Eggs shelf and food.
 */
export type NameScope =
  { rankable: true } | { rankable: false; parentId: string | null };

type Lookups = Pick<
  D1TaxonomyRepository,
  "names" | "category" | "ancestors" | "countryActive" | "proposalsSince"
>;

export async function assertNamesAvailable(
  repository: Pick<Lookups, "names">,
  names: string[],
  scope: NameScope,
  except?: string,
) {
  const keys = new Set(names.map(categoryKey));
  const taken = (await repository.names()).find(
    (n) =>
      n.id !== except &&
      keys.has(categoryKey(n.value)) &&
      (scope.rankable
        ? n.isAlias === 1 || n.rankable === 1
        : n.isAlias === 0 && n.parentId === scope.parentId),
  );
  if (taken)
    throw new ApplicationError(
      "CATEGORY_EXISTS",
      scope.rankable
        ? `“${taken.value}” already names a food${taken.active ? "" : " (retired)"}. Use or alias the existing food.`
        : `“${taken.value}” already names a group here${taken.active ? "" : " (retired)"}. Choose another name.`,
      409,
    );
}

// Suggested foods choose a shelf: an active group two levels below Food.
export async function assertShelf(
  repository: Pick<Lookups, "category" | "ancestors">,
  shelfId: string,
) {
  const shelf = await repository.category(shelfId);
  const ancestors = shelf ? await repository.ancestors(shelfId) : [];
  if (!shelf || !shelf.isActive || shelf.isRankable || ancestors.length !== 2)
    throw new ApplicationError(
      "INVALID_SHELF",
      "Choose the shelf the new food belongs on.",
    );
}

export interface SuggestedFood {
  name: string;
  shelfId: string;
  country: string;
  aliases: string[];
}

/**
 * The deterministic checks every food suggestion passes before any automated
 * check, whether it comes from the Suggest a food page or inside Add a
 * product: a usable address, the daily allowance, names unused by any food,
 * a real shelf and an open country.
 */
export class FoodSuggestions {
  readonly perDay = PROPOSALS_PER_DAY;
  constructor(
    private readonly repository: Lookups,
    private readonly clock = Date.now,
  ) {}
  async check(actor: Actor, food: SuggestedFood) {
    assertCategorySlug(categorySlug(food.name));
    const day = Math.floor(this.clock() / 86_400_000) * 86_400_000;
    if (
      (await this.repository.proposalsSince(actor.id, day)) >= PROPOSALS_PER_DAY
    )
      throw new ApplicationError(
        "PROPOSAL_LIMIT",
        "You’ve suggested the most foods allowed today. Try again tomorrow.",
        429,
      );
    await assertNamesAvailable(this.repository, [food.name, ...food.aliases], {
      rankable: true,
    });
    await assertShelf(this.repository, food.shelfId);
    // Every suggestion belongs to a country people can browse.
    if (!(await this.repository.countryActive(food.country)))
      throw invalidCountry();
  }
}
