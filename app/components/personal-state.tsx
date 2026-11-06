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
  matchesPendingRating,
  storePendingRating,
  type PendingRating,
} from "../lib/pending-rating";
import {
  clearPendingSave,
  readPendingSave,
  storePendingSave,
} from "../lib/pending-save";
import { t } from "../i18n";

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
  // Absent until this browser knows; the save icon then falls back to its page.
  saved: Record<string, boolean>;
  registerSaved: (productId: string) => () => void;
  setProductSaved: (
    productId: string,
    value: boolean,
    returnTo: string,
  ) => Promise<void>;
}
const Context = createContext<PersonalContext | null>(null);
export const ratingKey = (versionId: string, categoryId: string) =>
  `${versionId}:${categoryId}`;
// The parts of a selection worth keeping across sign-in (never a challenge
// token, which is single use).
export function draftOf(input: RatingInput | PendingRating): RatingInput {
  return {
    productVersionId: input.productVersionId,
    categoryId: input.categoryId,
    overallSimilarity: input.overallSimilarity,
    ...(input.dimensions ? { dimensions: input.dimensions } : {}),
    ...(input.conventionalRecency !== undefined
      ? { conventionalRecency: input.conventionalRecency }
      : {}),
    ...(input.enjoyment !== undefined ? { enjoyment: input.enjoyment } : {}),
  };
}
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
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const savedRef = useRef<Record<string, boolean>>({});
  // A write in this tab outranks a state read that may have started before it.
  const writtenSaves = useRef(new Set<string>());
  const attemptedSave = useRef<string | null>(null);
  const savedProducts = useRef(new Map<string, number>());
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
  const trackId = useCallback((tracked: Map<string, number>, id: string) => {
    tracked.set(id, (tracked.get(id) ?? 0) + 1);
    setRevision((value) => value + 1);
    return () => {
      const count = (tracked.get(id) ?? 1) - 1;
      if (count) tracked.set(id, count);
      else tracked.delete(id);
      setRevision((value) => value + 1);
    };
  }, []);
  const register = useCallback(
    (id: string) => trackId(versions.current, id),
    [trackId],
  );
  const registerSaved = useCallback(
    (id: string) => trackId(savedProducts.current, id),
    [trackId],
  );
  const markSaved = useCallback((productId: string, value: boolean) => {
    savedRef.current = { ...savedRef.current, [productId]: value };
    setSaved(savedRef.current);
  }, []);

  const signIn = useCallback((input: RatingInput, returnTo: string) => {
    try {
      storePendingRating(sessionStorage, {
        id: crypto.randomUUID(),
        ...draftOf(input),
        createdAt: Date.now(),
        returnTo,
      });
    } catch {
      throw new SaveError(t("personal.storage"), "STORAGE_UNAVAILABLE", 400);
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
                t("personal.signingIn"),
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
                t("personal.connectionLostSelection"),
                "NETWORK_ERROR",
                0,
              );
            }
            const result = (await response.json().catch(() => ({
              title: t("personal.badResponse"),
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
                result.title ?? t("personal.notSaved"),
                result.code ?? "SAVE_FAILED",
                response.status,
              );
            if (!result.data?.rating)
              throw new SaveError(
                t("personal.unconfirmed"),
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
              if (pending && matchesPendingRating(pending, saved.rating)) {
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

  const signInToSave = useCallback((productId: string, returnTo: string) => {
    try {
      storePendingSave(sessionStorage, productId);
    } catch {
      /* Signing in still works; the visitor taps save again afterwards. */
    }
    window.location.assign(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }, []);

  const writeSaved = useCallback(
    async (productId: string, value: boolean, returnTo: string) => {
      const response = await fetch(
        `/api/v1/me/saved-products/${encodeURIComponent(productId)}`,
        { method: value ? "PUT" : "DELETE" },
      ).catch(() => {
        throw new Error(t("personal.connectionLost"));
      });
      if (response.status === 401) {
        userRef.current = null;
        setUser(null);
        if (value) signInToSave(productId, returnTo);
        else
          window.location.assign(
            `/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
          );
        return;
      }
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          title?: string;
        } | null;
        throw new Error(result?.title ?? t("save.unchanged"));
      }
      writtenSaves.current.add(productId);
      markSaved(productId, value);
    },
    [markSaved, signInToSave],
  );

  const setProductSaved = useCallback(
    async (productId: string, value: boolean, returnTo: string) => {
      if (!userRef.current) signInToSave(productId, returnTo);
      else await writeSaved(productId, value, returnTo);
    },
    [signInToSave, writeSaved],
  );

  const select = useCallback(
    (input: RatingInput, returnTo: string) => {
      try {
        const stored = readPendingRating(
          sessionStorage,
          window.location.origin,
        );
        if (stored) {
          const updated = { ...stored, ...draftOf(input), returnTo };
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
      const productIds = [...savedProducts.current.keys()].slice(0, 40);
      void fetch(
        `/api/v1/me/rating-state?versionIds=${encodeURIComponent(ids.join(","))}&productIds=${encodeURIComponent(productIds.join(","))}`,
        { signal: controller.signal, cache: "no-store" },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(t("personal.loadFailed"));
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
            writtenSaves.current.clear();
          }
          userRef.current = data.user;
          setUser(data.user);
          setSiteKey(data.turnstileSiteKey);
          setError("");
          for (const id of productIds)
            if (!writtenSaves.current.has(id))
              markSaved(id, data.savedProductIds.includes(id));
          for (const rating of data.ratings)
            getQueue(
              rating,
              `${window.location.pathname}${window.location.search}${window.location.hash}`,
            ).initialize(
              rating.overallSimilarity,
              data.triedVersionIds.includes(rating.productVersionId),
              rating,
            );
          if (data.user) {
            const pendingSave = (() => {
              try {
                return readPendingSave(sessionStorage);
              } catch {
                return null;
              }
            })();
            if (pendingSave && attemptedSave.current !== pendingSave) {
              attemptedSave.current = pendingSave;
              void writeSaved(pendingSave, true, window.location.pathname)
                .then(() => clearPendingSave(sessionStorage))
                .catch(() => {
                  /* Kept for the next page, which tries once more. */
                });
            }
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
              getQueue(pending, pending.returnTo).select(draftOf(pending));
            }
          }
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setError(
              reason instanceof Error
                ? reason.message
                : t("personal.loadFailedShort"),
            );
        });
    }, 20);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [revision, location.pathname, getQueue, markSaved, writeSaved]);

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
        saved,
        registerSaved,
        setProductSaved,
      }}
    >
      {children}
    </Context.Provider>
  );
}
