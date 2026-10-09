import { useState } from "react";
import { draftOf, ratingKey, usePersonalState } from "./personal-state";
import { Turnstile } from "./turnstile";

export function PendingRatingRecovery() {
  const { pending, states, select, siteKey, forgetPending, visibleVersionIds } =
    usePersonalState();
  const [token, setToken] = useState("");
  if (!pending) return null;
  const state = states[ratingKey(pending.productVersionId, pending.categoryId)];
  if (!state || !["error", "conflict", "challenge"].includes(state.status))
    return null;
  // The visible control already owns retry/challenge UI. Keep a global recovery
  // path when a formula transition removed that control during sign-in.
  if (
    state.status !== "conflict" &&
    visibleVersionIds.includes(pending.productVersionId)
  )
    return null;
  return (
    <aside className="notice pending-recovery" aria-label="Your pending rating">
      <strong>
        Your selected {pending.overallSimilarity}/5 hasn’t been saved.
      </strong>
      <p role="status">{state.message}</p>
      {state.status === "conflict" ? (
        <a
          href={pending.returnTo.split("?")[0]?.split("#")[0]}
          onClick={forgetPending}
        >
          Open the current formula and choose a fresh score →
        </a>
      ) : (
        <>
          {state.status === "challenge" && (
            <Turnstile siteKey={siteKey} action="rating" onToken={setToken} />
          )}
          <button
            className="button secondary"
            disabled={state.status === "challenge" && !token}
            onClick={() => {
              select(
                {
                  ...draftOf(pending),
                  ...(token ? { challengeToken: token } : {}),
                },
                pending.returnTo,
              );
              setToken("");
            }}
          >
            Retry selected rating
          </button>
        </>
      )}
      <button className="text-button" onClick={forgetPending}>
        Discard selection
      </button>
    </aside>
  );
}
