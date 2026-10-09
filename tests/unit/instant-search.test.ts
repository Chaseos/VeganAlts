import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DEBOUNCE_MS,
  InstantSearchController,
  suggestable,
  type Suggestions,
} from "../../app/lib/instant-search";

const answer = (query: string): Suggestions => ({
  query,
  foods: [],
  products: [],
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("waits for a pause, needs two letters and aborts stale requests", async () => {
  const signals: AbortSignal[] = [];
  const load = vi.fn((query: string, signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<Suggestions>((resolve) =>
      setTimeout(() => resolve(answer(query)), 500),
    );
  });
  const changed = vi.fn();
  const search = new InstantSearchController(load, changed);
  search.input("b");
  expect(search.state.status).toBe("idle");
  search.input("be");
  search.input("bee");
  expect(search.state).toMatchObject({ query: "bee", status: "loading" });
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  expect(load).toHaveBeenCalledTimes(1);
  expect(load.mock.calls[0]![0]).toBe("bee");
  // A new query while the first is in flight aborts it.
  search.input("beef");
  expect(signals[0]!.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 500);
  expect(search.state).toMatchObject({ query: "beef", status: "ready" });
  expect(search.state.result?.query).toBe("beef");
  // A remembered answer returns without another request.
  search.input("bee");
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS + 500);
  search.input("BEEF ");
  expect(search.state).toMatchObject({ status: "ready" });
  expect(load).toHaveBeenCalledTimes(3);
  search.dispose();
});

it("reports failures and counts letters in any script", async () => {
  const search = new InstantSearchController(
    () => Promise.reject(new Error("offline")),
    vi.fn(),
  );
  search.input("tofu");
  await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  expect(search.state.status).toBe("error");
  expect(suggestable("é1")).toBe(true);
  expect(suggestable("  ' ")).toBe(false);
});
