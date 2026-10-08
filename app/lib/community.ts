import { useRef, useState } from "react";

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
): Promise<T> {
  const form = body instanceof FormData,
    headers = new Headers();
  if (body !== undefined) {
    if (!form) headers.set("Content-Type", "application/json");
    headers.set("Idempotency-Key", key ?? crypto.randomUUID());
  }
  if (token) headers.set("X-Turnstile-Token", token);
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const value = (await response.json()) as {
    data: T;
    title?: string;
    code?: string;
  };
  if (!response.ok)
    throw new CommunityError(
      value.title ?? "The request could not be saved.",
      value.code ?? "REQUEST_FAILED",
      response.status,
    );
  return value.data;
}
export function useCommunityAction() {
  const [busy, setBusy] = useState(false),
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
    if (body !== undefined && !key) {
      const identity = path + JSON.stringify(body);
      key = keys.current.get(identity) ?? crypto.randomUUID();
      keys.current.set(identity, key);
    }
    const value = token.current;
    setToken("");
    // Tokens are single-use, including rejected requests. A multi-request flow
    // may need another challenge before its next upload or finalization.
    if (value) setChallengeAttempt((attempt) => attempt + 1);
    return communityRequest<T>(path, body, key, value);
  }
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    try {
      const result = await work();
      setChallenge(false);
      return result;
    } catch (error) {
      if (
        error instanceof CommunityError &&
        error.code === "CHALLENGE_REQUIRED"
      )
        setChallenge(true);
      setError(
        error instanceof Error
          ? error.message
          : "The request could not be saved. Please retry.",
      );
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    error,
    challenge,
    challengeAttempt,
    hasToken,
    errorRef,
    setToken,
    request,
    run,
    clearError: () => setError(""),
  };
}
export interface CommunityOptions {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string; slug: string }[];
  families: { id: string; name: string; brandId: string | null }[];
  products: { id: string; name: string; slug: string; countryId: string }[];
  retailers: { id: string; name: string; websiteUrl: string | null }[];
}
export type CommunityAction = ReturnType<typeof useCommunityAction>;
export function friendly(value: string) {
  return value.replaceAll("_", " ");
}
export function dateLabel(value: number | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      })
    : "Not yet confirmed";
}
