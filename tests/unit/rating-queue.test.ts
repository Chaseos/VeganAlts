import { expect, it, vi } from "vitest";
import { RatingQueue, SaveError } from "../../app/lib/rating-queue";
import type {
  RatingInput,
  SavedRating,
} from "../../server/ratings/domain/contracts";

const input = (score: number): RatingInput => ({
  productVersionId: "formula",
  categoryId: "category",
  overallSimilarity: score,
});
const result = (score: number): SavedRating => ({
  rating: { ...input(score), id: "rating", updatedAt: 100 },
  tried: true,
  outcome: "updated",
});

it("serializes writes and coalesces rapid selections without stale UI responses", async () => {
  const resolvers: ((value: SavedRating) => void)[] = [];
  const write = vi.fn(
    () => new Promise<SavedRating>((resolve) => resolvers.push(resolve)),
  );
  const completed = vi.fn();
  const queue = new RatingQueue(write, vi.fn(), completed);
  queue.select(input(1));
  queue.select(input(2));
  queue.select(input(5));
  expect(write).toHaveBeenCalledTimes(1);
  expect(queue.state.selected).toBe(5);
  resolvers.shift()!(result(1));
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  expect(write.mock.calls[1]).toEqual([input(5)]);
  expect(queue.state).toMatchObject({ selected: 5, status: "saving" });
  resolvers.shift()!(result(5));
  await vi.waitFor(() => expect(queue.state.status).toBe("saved"));
  expect(queue.state).toMatchObject({ selected: 5, tried: true });
  queue.initialize(1, false);
  expect(queue.state.selected).toBe(5);
});

it("retains recoverable selections but stops queued writes on formula conflicts", async () => {
  const write = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(result(4));
  const queue = new RatingQueue(write, vi.fn(), vi.fn());
  queue.select(input(4));
  await vi.waitFor(() => expect(queue.state.status).toBe("error"));
  expect(queue.state.selected).toBe(4);
  queue.select(input(4));
  await vi.waitFor(() => expect(queue.state.status).toBe("saved"));
  const conflict = new RatingQueue(
    async () => {
      throw new SaveError("Choose the new formula", "NOT_RATEABLE", 409);
    },
    vi.fn(),
    vi.fn(),
  );
  conflict.select(input(2));
  conflict.select(input(5));
  await vi.waitFor(() => expect(conflict.state.status).toBe("conflict"));
  expect(conflict.state.selected).toBe(5);
});
