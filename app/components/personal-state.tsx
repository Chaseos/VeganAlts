import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";
import type {
  RatingInput,
  RatingState,
  SavedRating,
} from "@server/ratings/domain/contracts";
import {
  RatingQueue,
  SaveError,
  type RatingControlState,
} from "../lib/rating-queue";
import {
  clearPendingRating,
  readPendingRating,
  storePendingRating,
  type PendingRating,
} from "../lib/pending-rating";

type User = RatingState["user"];
interface PersonalContext {
  user: User | undefined;
  siteKey: string | null;
  error: string;
  register: (versionId: string) => () => void;
  states: Record<string, RatingControlState>;
  select: (input: RatingInput, returnTo: string) => void;
  retryLoad: () => void;
  pending: PendingRating | null;
  visibleVersionIds: string[];
  forgetPending: () => void;
}
const Context = createContext<PersonalContext | null>(null);
export const ratingKey = (versionId: string, categoryId: string) =>
  `${versionId}:${categoryId}`;
export function usePersonalState() {
  const context = useContext(Context);
  if (!context) throw new Error("Personal state is unavailable.");
  return context;
}
// Header parts also render in the root error boundary, outside the provider.
export function useOptionalPersonalState() {
  return useContext(Context);
}

export function PersonalStateProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [user, setUser] = useState<User | undefined>();
  const userRef = useRef<User | undefined>(undefined);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingRating | null>(null);
  const [states, setStates] = useState<Record<string, RatingControlState>>({});
  const [revision, setRevision] = useState(0);
  const versions = useRef(new Map<string, number>());
  const queues = useRef(new Map<string, RatingQueue>());
  const attempted = useRef(new Set<string>());
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const register = useCallback((id: string) => {
    versions.current.set(id, (versions.current.get(id) ?? 0) + 1);
    setRevision((value) => value + 1);
    return () => {
      const count = (versions.current.get(id) ?? 1) - 1;
      if (count) versions.current.set(id, count);
      else versions.current.delete(id);
      setRevision((value) => value + 1);
    };
  }, []);

  const signIn = useCallback((input: RatingInput, returnTo: string) => {
    try {
      storePendingRating(sessionStorage, {
        id: crypto.randomUUID(),
        productVersionId: input.productVersionId,
        categoryId: input.categoryId,
        overallSimilarity: input.overallSimilarity,
        createdAt: Date.now(),
        returnTo,
      });
    } catch {
      throw new SaveError(
        "Your browser could not remember this selection. Enable tab storage, then try again.",
        "STORAGE_UNAVAILABLE",
        400,
      );
    }
    window.location.assign(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  const getQueue = useCallback(
    (
      input: Pick<RatingInput, "productVersionId" | "categoryId">,
      returnTo: string,
    ) => {
      const key = ratingKey(input.productVersionId, input.categoryId);
      let queue = queues.current.get(key);
      if (!queue) {
        queue = new RatingQueue(
          async (selection) => {
            if (!userRef.current) {
              signIn(queue?.latestSelection(selection) ?? selection, returnTo);
              throw new SaveError(
                "Continuing to sign in…",
                "UNAUTHENTICATED",
                401,
              );
            }
            let response: Response;
            try {
              response = await fetch("/api/v1/ratings", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(selection),
              });
            } catch {
              void fetch("/api/v1/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  event: "rating_save_failed",
                  route: "product",
                }),
                keepalive: true,
              }).catch(() => {});
              throw new SaveError(
                "Connection lost. Your selection is here; retry when you’re ready.",
                "NETWORK_ERROR",
                0,
              );
            }
            const result = (await response.json().catch(() => ({
              title: "The service did not respond correctly. Please retry.",
            }))) as {
              data: SavedRating;
              title?: string;
              code?: string;
            };
            if (response.status === 401) {
              userRef.current = null;
              setUser(null);
              signIn(queue?.latestSelection(selection) ?? selection, returnTo);
            }
            if (!response.ok)
              throw new SaveError(
                result.title ?? "Your rating wasn’t saved. Please retry.",
                result.code ?? "SAVE_FAILED",
                response.status,
              );
            if (!result.data?.rating)
              throw new SaveError(
                "The saved rating could not be confirmed. Please retry.",
                "INVALID_RESPONSE",
                502,
              );
            return result.data;
          },
          (state) => {
            if (active.current)
              setStates((current) => ({ ...current, [key]: state }));
          },
          (saved) => {
            try {
              const pending = readPendingRating(
                sessionStorage,
                window.location.origin,
              );
              if (
                pending?.productVersionId === saved.rating.productVersionId &&
                pending.categoryId === saved.rating.categoryId &&
                pending.overallSimilarity === saved.rating.overallSimilarity
              ) {
                clearPendingRating(sessionStorage);
                if (active.current) setPending(null);
              }
            } catch {
              /* Saving remains successful when browser storage is disabled. */
            }
          },
        );
        queues.current.set(key, queue);
      }
      return queue;
    },
    [signIn],
  );

  const select = useCallback(
    (input: RatingInput, returnTo: string) => {
      try {
        const stored = readPendingRating(
          sessionStorage,
          window.location.origin,
        );
        if (stored) {
          const updated = {
            ...stored,
            productVersionId: input.productVersionId,
            categoryId: input.categoryId,
            overallSimilarity: input.overallSimilarity,
            returnTo,
          };
          storePendingRating(sessionStorage, updated);
          setPending(updated);
        }
      } catch {
        /* A signed-in save does not depend on browser storage. */
      }
      getQueue(input, returnTo).select(input);
    },
    [getQueue],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const ids = [...versions.current.keys()].slice(0, 40);
      void fetch(
        `/api/v1/me/rating-state?versionIds=${encodeURIComponent(ids.join(","))}`,
        { signal: controller.signal, cache: "no-store" },
      )
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              "Your personal state could not load. Please retry.",
            );
          return response.json() as Promise<{ data: RatingState }>;
        })
        .then(({ data }) => {
          if (controller.signal.aborted) return;
          if (
            userRef.current &&
            (!data.user || data.user.handle !== userRef.current.handle)
          ) {
            queues.current.clear();
            setStates({});
          }
          userRef.current = data.user;
          setUser(data.user);
          setSiteKey(data.turnstileSiteKey);
          setError("");
          for (const rating of data.ratings)
            getQueue(
              rating,
              `${window.location.pathname}${window.location.search}${window.location.hash}`,
            ).initialize(
              rating.overallSimilarity,
              data.triedVersionIds.includes(rating.productVersionId),
            );
          if (data.user) {
            let pending;
            try {
              pending = readPendingRating(
                sessionStorage,
                window.location.origin,
              );
            } catch {
              return;
            }
            setPending(pending);
            if (pending && !attempted.current.has(pending.id)) {
              attempted.current.add(pending.id);
              getQueue(pending, pending.returnTo).select({
                productVersionId: pending.productVersionId,
                categoryId: pending.categoryId,
                overallSimilarity: pending.overallSimilarity,
              });
            }
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setError(
              reason instanceof Error
                ? reason.message
                : "Personal state could not load.",
            );
        });
    }, 20);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [revision, location.pathname, getQueue]);

  return (
    <Context.Provider
      value={{
        user,
        siteKey,
        error,
        states,
        register,
        select,
        pending,
        visibleVersionIds: [...versions.current.keys()],
        forgetPending: () => {
          try {
            clearPendingRating(sessionStorage);
          } finally {
            setPending(null);
          }
        },
        retryLoad: () => setRevision((value) => value + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
