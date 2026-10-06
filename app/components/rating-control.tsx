import { useEffect, useState } from "react";
import { usePersonalState, ratingKey } from "./personal-state";
import { Turnstile } from "./turnstile";

export const SCORE_MEANINGS = [
  "Not close",
  "Slightly similar",
  "Fairly close",
  "Very close",
  "Extremely close",
];

export function RatingControl({
  versionId,
  categoryId,
  categoryName,
  productSlug,
}: {
  versionId: string;
  categoryId: string;
  categoryName: string;
  productSlug: string;
}) {
  const { user, siteKey, states, register, select, error, retryLoad } =
    usePersonalState();
  const [token, setToken] = useState("");
  useEffect(() => register(versionId), [register, versionId]);
  const state = states[ratingKey(versionId, categoryId)];
  const returnTo = `/us/products/${productSlug}#rate-${categoryId}`;
  function save(score: number) {
    select(
      {
        productVersionId: versionId,
        categoryId,
        overallSimilarity: score,
        ...(token ? { challengeToken: token } : {}),
      },
      returnTo,
    );
    setToken("");
  }
  return (
    <div className="rating-control">
      <fieldset
        disabled={user === undefined || state?.status === "conflict"}
        aria-describedby={`rating-help-${categoryId}`}
      >
        <legend>How close is it to {categoryName.toLowerCase()}?</legend>
        <div className="rating-buttons">
          {SCORE_MEANINGS.map((meaning, index) => (
            <button
              type="button"
              key={meaning}
              aria-label={`${index + 1} ${meaning} (${index + 1} of 5)`}
              aria-pressed={state?.selected === index + 1}
              onClick={() => save(index + 1)}
            >
              <span>{index + 1}</span> <small>{meaning}</small>
            </button>
          ))}
        </div>
      </fieldset>
      <p id={`rating-help-${categoryId}`} className="muted small">
        Choose a score to save.{" "}
        {user === null
          ? "Sign in to add your experience."
          : "Your rating also marks this formula as tried."}
      </p>
      <p
        className="save-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {state?.message ||
          (error
            ? ""
            : user === undefined
              ? "Loading your rating…"
              : state?.selected
                ? `Your rating: ${state.selected}/5`
                : "")}
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" className="text-button" onClick={retryLoad}>
            Retry
          </button>
        </p>
      )}
      {state?.status === "challenge" && (
        <Turnstile
          key={state.message}
          siteKey={siteKey}
          action="rating"
          onToken={setToken}
        />
      )}
      {(state?.status === "error" || state?.status === "challenge") &&
        state.selected !== null && (
          <button
            className="button secondary"
            type="button"
            disabled={state.status === "challenge" && !token}
            onClick={() => save(state.selected!)}
          >
            Retry saving {state.selected}/5
          </button>
        )}
      {state?.status === "conflict" && (
        <p>
          This formula or category has changed.{" "}
          <a href={`/us/products/${productSlug}`}>Open the current formula</a>{" "}
          and choose a new score.
        </p>
      )}
    </div>
  );
}
