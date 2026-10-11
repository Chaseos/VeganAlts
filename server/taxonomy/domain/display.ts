const same = (a: string, b: string) =>
  a.normalize("NFKC").trim().toLocaleLowerCase() ===
  b.normalize("NFKC").trim().toLocaleLowerCase();

/**
 * A "silent" shelf only repeats its aisle or its one food (Eggs › Eggs › Eggs,
 * Dairy › Milk › Milk), or is its aisle's only shelf. Navigation then skips it
 * as a level; its URL and `?shelf=` keep working.
 */
export function silentShelf(
  aisle: { name: string },
  shelf: { name: string },
  foods: readonly { name: string }[],
  shelfCount: number,
) {
  return (
    shelfCount <= 1 ||
    same(shelf.name, aisle.name) ||
    (foods.length === 1 && same(foods[0]!.name, shelf.name))
  );
}
