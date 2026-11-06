import { pageLocale, t, type MessageKey } from "../i18n";
import { en } from "../i18n/en";
import { useRef, useState } from "react";

/** Stands in for a note someone was allowed to leave blank. */
export const NO_NOTE = "No note added.";

export class CommunityError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function communityRequest<T>(
  path: string,
  body?: unknown,
  key?: string,
  token?: string,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const form = body instanceof FormData,
    headers = new Headers();
  if (body !== undefined) {
    if (!form) headers.set("Content-Type", "application/json");
    headers.set("Idempotency-Key", key ?? crypto.randomUUID());
  }
  if (token) headers.set("X-Turnstile-Token", token);
  let response: Response;
  try {
    response = await fetch(`/api/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (error) {
    if (options?.signal?.aborted) throw error;
    throw new CommunityError(t("community.errNetwork"), "NETWORK_ERROR", 0);
  }
  const value = (await response.json().catch(() => null)) as {
    data: T;
    title?: string;
    code?: string;
  } | null;
  if (!response.ok || !value || typeof value !== "object" || !("data" in value))
    throw new CommunityError(
      [
        "CHECK_IN_PROGRESS",
        "CHECKING_AUTOMATICALLY",
        "CHECK_RESUBMIT_REQUIRED",
        "MODERATION_UNAVAILABLE",
        "PROFILE_CHECK_UNAVAILABLE",
        "MODERATION_ACCOUNT_LIMIT",
        "MODERATION_CAPACITY",
      ].includes(value?.code ?? "")
        ? (value?.title ?? t("community.errCheck"))
        : response.status === 401
          ? t("community.errSession")
          : response.status === 429
            ? t("community.errRate")
            : response.status >= 500 || !value || typeof value !== "object"
              ? t("community.errServer")
              : (value.title ?? t("community.errSave")),
      value?.code ?? "REQUEST_FAILED",
      response.status,
    );
  return value.data;
}
export function useCommunityAction() {
  const [busy, setBusy] = useState(false),
    [sessionExpired, setSessionExpired] = useState(false),
    [checking, setChecking] = useState(false),
    [error, setError] = useState(""),
    [challenge, setChallenge] = useState(false),
    [challengeAttempt, setChallengeAttempt] = useState(0),
    [hasToken, setHasToken] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null),
    token = useRef("");
  const keys = useRef(new Map<string, string>());
  const setToken = (value: string) => {
    token.current = value;
    setHasToken(Boolean(value));
  };
  async function request<T>(path: string, body?: unknown, key?: string) {
    // A failed submission retries with the same key; once one succeeds, an
    // identical later submission is a new action with a new key.
    const identity =
      body !== undefined && !key ? path + JSON.stringify(body) : null;
    if (identity) {
      key = keys.current.get(identity) ?? crypto.randomUUID();
      keys.current.set(identity, key);
    }
    const value = token.current;
    setToken("");
    // Tokens are single-use, including rejected requests. A multi-request flow
    // may need another challenge before its next upload or finalization.
    if (value) setChallengeAttempt((attempt) => attempt + 1);
    let result: T;
    try {
      result = await communityRequest<T>(path, body, key, value);
    } catch (error) {
      if (
        identity &&
        error instanceof CommunityError &&
        ["CHECK_RESUBMIT_REQUIRED", "CONTRIBUTION_BLOCKED"].includes(error.code)
      )
        keys.current.delete(identity);
      throw error;
    }
    if (identity) keys.current.delete(identity);
    return result;
  }
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    setSessionExpired(false);
    setChecking(false);
    try {
      const result = await work();
      setChallenge(false);
      return result;
    } catch (error) {
      setChecking(
        error instanceof CommunityError &&
          error.code === "CHECKING_AUTOMATICALLY",
      );
      setSessionExpired(
        error instanceof CommunityError && error.status === 401,
      );
      if (
        error instanceof CommunityError &&
        error.code === "CHALLENGE_REQUIRED"
      )
        setChallenge(true);
      setError(error instanceof Error ? error.message : t("community.errSave"));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    sessionExpired,
    checking,
    error,
    challenge,
    challengeAttempt,
    hasToken,
    errorRef,
    setToken,
    request,
    run,
    clearError: () => {
      setError("");
      setChecking(false);
    },
  };
}
export interface CommunityOptions {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string; slug: string }[];
  families: { id: string; name: string; brandId: string | null }[];
  products: {
    id: string;
    name: string;
    slug: string;
    countryId: string;
    country: string;
    brand: string | null;
  }[];
  retailers: { id: string; name: string; websiteUrl: string | null }[];
}
export type CommunityAction = ReturnType<typeof useCommunityAction>;
/** A coded value as a word, such as a status. An unlisted code is spelled out. */
export function friendly(value: string) {
  const key = `code.${value}`;
  return key in en ? t(key as MessageKey) : value.replaceAll("_", " ");
}
// Report reasons whose code doesn't read well on its own (milestone 7).
const REPORT_REASONS: Record<string, MessageKey> = {
  out_of_scope: "community.reasonOutOfScope",
  flavor_not_real: "community.reasonFlavorNotReal",
  wrong_line: "community.reasonWrongLine",
} as const;
export const reportReasonLabel = (reason: string) =>
  REPORT_REASONS[reason] ? t(REPORT_REASONS[reason]) : friendly(reason);
export function dateLabel(value: number | null) {
  return value
    ? new Date(value).toLocaleDateString(pageLocale(), {
        dateStyle: "medium",
        timeZone: "UTC",
      })
    : t("community.notConfirmed");
}
