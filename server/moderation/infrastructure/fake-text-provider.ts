import type {
  FoodTextProvider,
  SuggestedName,
  TextOutput,
} from "../domain/food-review";

/** Local and test text: names map through `known`, others are unusable. */
export class FakeTextProvider implements FoodTextProvider {
  readonly name = "fake";
  constructor(private readonly known: Record<string, TextOutput> = {}) {}
  async describe({ name }: SuggestedName) {
    return this.known[name] ?? null;
  }
}
