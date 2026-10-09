import { useEffect, useRef, useState } from "react";
import type { CatalogService } from "@server/catalog/application/service";

export type Suggestions = Awaited<ReturnType<CatalogService["suggest"]>>;
export type SuggestedFood = Suggestions["foods"][number];
export type SuggestedProduct = Suggestions["products"][number];
export interface InstantSearchState {
  query: string;
  status: "idle" | "loading" | "ready" | "error";
  result: Suggestions | null;
}

export const DEBOUNCE_MS = 150;
const CACHE_SIZE = 20;
// Instant answers start at two letters or digits, like the server.
export const suggestable = (query: string) =>
  (query.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 2;

/**
 * Turns keystrokes into at most one request per pause: waits briefly, aborts
 * a stale request when the query changes and remembers recent answers.
 */
export class InstantSearchController {
  state: InstantSearchState = { query: "", status: "idle", result: null };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private request: AbortController | null = null;
  private readonly cache = new Map<string, Suggestions>();
  constructor(
    private readonly load: (
      query: string,
      signal: AbortSignal,
    ) => Promise<Suggestions>,
    private readonly changed: (state: InstantSearchState) => void,
  ) {}
  input(raw: string) {
    const query = raw.normalize("NFKC").trim().slice(0, 80);
    if (query === this.state.query && this.state.status !== "error") return;
    this.cancel();
    if (!suggestable(query))
      return this.set({ query, status: "idle", result: null });
    const cached = this.cache.get(query.toLowerCase());
    if (cached) return this.set({ query, status: "ready", result: cached });
    // Earlier answers stay on screen while the next one loads.
    this.set({ query, status: "loading", result: this.state.result });
    this.timer = setTimeout(() => void this.fetch(query), DEBOUNCE_MS);
  }
  dispose() {
    this.cancel();
  }
  private async fetch(query: string) {
    this.timer = null;
    const request = new AbortController();
    this.request = request;
    try {
      const result = await this.load(query, request.signal);
      if (request.signal.aborted) return;
      this.remember(query.toLowerCase(), result);
      this.set({ query, status: "ready", result });
    } catch {
      if (!request.signal.aborted)
        this.set({ query, status: "error", result: null });
    } finally {
      if (this.request === request) this.request = null;
    }
  }
  private remember(key: string, result: Suggestions) {
    this.cache.delete(key);
    this.cache.set(key, result);
    if (this.cache.size > CACHE_SIZE)
      this.cache.delete(this.cache.keys().next().value!);
  }
  private cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.request?.abort();
    this.request = null;
  }
  private set(state: InstantSearchState) {
    this.state = state;
    this.changed(state);
  }
}

export function useInstantSearch(country: string) {
  const [state, setState] = useState<InstantSearchState>({
    query: "",
    status: "idle",
    result: null,
  });
  const controller = useRef<InstantSearchController | null>(null);
  useEffect(() => {
    const current = new InstantSearchController(async (query, signal) => {
      const response = await fetch(
        `/api/v1/suggest?country=${country}&q=${encodeURIComponent(query)}`,
        { signal },
      );
      if (!response.ok) throw new Error("Suggestions are unavailable.");
      return ((await response.json()) as { data: Suggestions }).data;
    }, setState);
    controller.current = current;
    return () => current.dispose();
  }, [country]);
  return {
    state,
    input: (value: string) => controller.current?.input(value),
  };
}
