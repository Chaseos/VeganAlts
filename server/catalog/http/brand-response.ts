import type { CatalogService } from "../application/service";

/** Keep the v1 payload stable while the page uses richer score context. */
export function brandResponse(
  brand: Awaited<ReturnType<CatalogService["brand"]>>,
) {
  return {
    ...brand,
    aisles: brand.aisles.map((aisle) => ({
      ...aisle,
      foods: aisle.foods.map((food) => ({
        ...food,
        lines: food.lines.map(
          ({ tastiestPeople: _, rankedFlavorCount: __, ...line }) => line,
        ),
      })),
    })),
  };
}
