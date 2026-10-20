import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigation, useNavigationType } from "react-router";
import type { CatalogBatch } from "@server/catalog/domain/batches";
import { appendBatch, browseCache } from "../../lib/browse-cache";

export function useBatches<T>({
  context,
  section,
  initial,
  endpoint,
  identity,
}: {
  context: string;
  section: string;
  initial: CatalogBatch<T>;
  endpoint: string;
  identity: (item: T) => string;
}) {
  const navigation = useNavigationType();
  const pendingNavigation = useNavigation();
  const [batches, setBatches] = useState(
    () =>
      (navigation === "POP" &&
        typeof window !== "undefined" &&
        browseCache.read<T>(context, section)) || [initial],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const request = useRef<AbortController | null>(null);
  const list = useRef<HTMLOListElement & HTMLUListElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const position = useRef<{
    x: number;
    y: number;
    anchor: HTMLElement | null;
    top: number;
  } | null>(null);
  const currentBatches = useRef(batches);
  currentBatches.current = batches;
  useLayoutEffect(() => {
    const element = list.current;
    if (navigation === "POP") {
      const open = new Set(browseCache.readOpen(context, section));
      element?.querySelectorAll<HTMLElement>("[data-result]").forEach((row) => {
        const details = row.querySelector("details");
        if (details && open.has(row.dataset.result!)) details.open = true;
      });
    }
    return () => {
      const open = Array.from(
        element?.querySelectorAll<HTMLElement>(
          "[data-result]:has(details[open])",
        ) ?? [],
      ).map((row) => row.dataset.result!);
      browseCache.write(context, section, currentBatches.current, open);
    };
  }, [context, section]);
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
    },
    [context, section],
  );
  useEffect(() => {
    const next = pendingNavigation.location;
    if (next && next.pathname + next.search !== context) {
      request.current?.abort();
      request.current = null;
      setBusy(false);
    }
  }, [pendingNavigation.location, context]);
  useEffect(() => {
    browseCache.write(context, section, batches);
  }, [batches, context, section]);
  useLayoutEffect(() => {
    if (pendingFocus.current) {
      const row = Array.from(
        list.current?.querySelectorAll<HTMLElement>("[data-result]") ?? [],
      ).find((element) => element.dataset.result === pendingFocus.current);
      row?.focus({ preventScroll: true });
      const saved = position.current;
      if (saved) {
        // The reader may have scrolled into another section while this request
        // was pending. Keep the visible card in place when rows are inserted
        // above it, including in engines without native scroll anchoring.
        const delta = saved.anchor?.isConnected
          ? saved.anchor.getBoundingClientRect().top - saved.top
          : saved.y - window.scrollY;
        if (delta) window.scrollTo(saved.x, window.scrollY + delta);
      }
      pendingFocus.current = null;
      position.current = null;
    }
  }, [batches, context, section]);
  const last = batches[batches.length - 1]!;
  async function load() {
    if (request.current || !last.nextCursor) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setAnnouncement("");
    try {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("section", section);
      url.searchParams.set("cursor", last.nextCursor);
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: "omit",
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Please wait a moment, then retry."
            : "More results could not be loaded. Please retry.",
        );
      const value = (await response.json()) as { data: CatalogBatch<T> };
      if (!value.data || !Array.isArray(value.data.items))
        throw new Error("More results could not be loaded. Please retry.");
      if (controller.signal.aborted) return;
      const next = appendBatch(batches, value.data, identity);
      const added = next[next.length - 1]!.items;
      pendingFocus.current = added[0] ? identity(added[0]) : null;
      let anchor: HTMLElement | null = null;
      let top = 0;
      for (const element of document.querySelectorAll<HTMLElement>(
        "main [data-result]",
      )) {
        const bounds = element.getBoundingClientRect();
        if (bounds.bottom > 100 && bounds.top < window.innerHeight) {
          anchor = element;
          top = bounds.top;
          break;
        }
      }
      position.current = { x: window.scrollX, y: window.scrollY, anchor, top };
      setBatches(next);
      setAnnouncement(
        `${added.length} more ${section === "unranked" ? "unrated products" : section === "ranked" ? "results" : section} added.`,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error &&
            !(error instanceof TypeError) &&
            !(error instanceof SyntaxError)
            ? error.message
            : "More results could not be loaded. Check your connection and retry.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  const href = new URL(context, "https://veganalts.invalid");
  href.searchParams.delete("page");
  href.searchParams.delete("unrankedPage");
  href.searchParams.set("section", section);
  if (last.nextCursor) href.searchParams.set("cursor", last.nextCursor);
  return {
    batches,
    list,
    count: batches.reduce((sum, batch) => sum + batch.items.length, 0),
    control: {
      href: href.pathname + href.search,
      busy,
      error,
      announcement,
      load,
      hasMore: Boolean(last.nextCursor),
      limitReached: last.limitReached,
      section,
    },
  };
}

export function SeeMore({
  href,
  busy,
  error,
  announcement,
  load,
  hasMore,
  limitReached,
  section,
}: {
  href: string;
  busy: boolean;
  error: string;
  announcement: string;
  load: () => void;
  hasMore: boolean;
  limitReached: boolean;
  section: string;
}) {
  return (
    <div className="va-see-more">
      {error && <p role="alert">{error}</p>}
      {hasMore && (
        <a
          className="button secondary"
          href={href}
          aria-disabled={busy || undefined}
          aria-label={`${error ? "Retry" : "See more"} ${section === "ranked" ? "ranked results" : section === "unranked" ? "unrated products" : section}`}
          onClick={(event) => {
            if (
              event.button ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            if (!busy) load();
          }}
        >
          {busy ? "Loading…" : error ? "Retry" : "See more"}
        </a>
      )}
      {limitReached && (
        <p className="va-muted">
          You’ve reached the browsing limit. Refine your search or filters to
          find more.
        </p>
      )}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </div>
  );
}

function Items<T>({
  batch,
  render,
}: {
  batch: CatalogBatch<T>;
  render: (item: T, batch: CatalogBatch<T>) => ReactNode;
}) {
  return <>{batch.items.map((item) => render(item, batch))}</>;
}
export const BatchItems = memo(Items) as typeof Items;
