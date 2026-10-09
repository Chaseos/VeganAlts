import { useEffect, useState } from "react";
import type { RatingInput } from "@server/ratings/domain/contracts";
import type { ConventionalRecency } from "@server/ratings/domain/details";
import { usePersonalState, ratingKey } from "./personal-state";
import { Turnstile } from "./turnstile";
import { productPath, useCountryCode } from "../lib/site-chrome";

export const SCORE_MEANINGS = [
  "Not close",
  "Slightly similar",
  "Fairly close",
  "Very close",
  "Extremely close",
];
export const LAST_ATE: { value: ConventionalRecency; label: string }[] = [
  { value: "current_or_week", label: "This week" },
  { value: "within_month", label: "This month" },
  { value: "within_year", label: "This year" },
  { value: "over_year", label: "Over a year ago" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
export interface RatingQuestion {
  key: string;
  label: string;
}

/**
 * The rating form for one food (canvas: Rating4). Every tap saves: the overall
 * score first, then the optional detail questions and "last ate" that appear
 * once it is chosen. Tapping a chosen detail again clears it.
 */
export function RatingControl({
  versionId,
  categoryId,
  categoryName,
  productSlug,
  foodSlug,
  dimensions,
}: {
  versionId: string;
  categoryId: string;
  categoryName: string;
  productSlug: string;
  foodSlug?: string;
  dimensions: RatingQuestion[];
}) {
  const { user, siteKey, states, register, select, error, retryLoad } =
    usePersonalState();
  const [token, setToken] = useState("");
  useEffect(() => register(versionId), [register, versionId]);
  const state = states[ratingKey(versionId, categoryId)];
  const country = useCountryCode();
  // Sign-in returns to this food's view of the product.
  const returnTo = `${productPath(country, productSlug)}${foodSlug ? `?food=${foodSlug}` : ""}#rate-${categoryId}`;
  const food = categoryName.toLowerCase();
  const answers = state?.dimensions ?? {};
  const recency = state?.recency ?? null;
  const hasDetails =
    recency !== null || dimensions.some((d) => answers[d.key] !== undefined);
  // Each write carries the whole draft so the newest one wins outright.
  function save(
    change: {
      score?: number;
      dimensions?: Record<string, number | null>;
      recency?: ConventionalRecency | null;
    } = {},
  ) {
    const score = change.score ?? state?.selected;
    if (!score) return;
    const draft: RatingInput = {
      productVersionId: versionId,
      categoryId,
      overallSimilarity: score,
      dimensions: Object.fromEntries(
        dimensions.map((d) => [
          d.key,
          change.dimensions && d.key in change.dimensions
            ? change.dimensions[d.key]!
            : (answers[d.key] ?? null),
        ]),
      ),
      conventionalRecency:
        change.recency !== undefined ? change.recency : recency,
      ...(token ? { challengeToken: token } : {}),
    };
    select(draft, returnTo);
    setToken("");
  }
  const helpId = `rating-help-${categoryId}`;
  return (
    <section className="va-rate" aria-label={`Rate it as ${food}`}>
      <fieldset
        className="va-rate__group"
        disabled={user === undefined || state?.status === "conflict"}
        aria-describedby={helpId}
      >
        <legend className="va-rate__title">
          Tried it? How close is it to {food}?
        </legend>
        <div className="va-rate__overall">
          {SCORE_MEANINGS.map((meaning, index) => (
            <button
              type="button"
              key={meaning}
              aria-label={`${index + 1} ${meaning} (${index + 1} of 5)`}
              aria-pressed={state?.selected === index + 1}
              onClick={() => save({ score: index + 1 })}
            >
              <span className="va-rate__number">{index + 1}</span>{" "}
              <span className="va-rate__meaning">{meaning}</span>
            </button>
          ))}
        </div>
        <p className="va-rate__ends" aria-hidden="true">
          <span>{SCORE_MEANINGS[0]}</span>
          <span>{SCORE_MEANINGS[4]}</span>
        </p>
      </fieldset>
      <p id={helpId} className="va-rate__help">
        {user === null
          ? "Choose a score; you’ll sign in to save it."
          : "Each choice saves right away. Your rating also marks this formula as tried."}
      </p>
      {state?.selected ? (
        <div className="va-rate__more">
          <fieldset disabled={state.status === "conflict"}>
            <legend className="va-rate__subtitle">
              Add detail <span>optional</span>
            </legend>
            {dimensions.map((dimension) => (
              <div
                className="va-rate__detail"
                role="group"
                aria-labelledby={`detail-${categoryId}-${dimension.key}`}
                key={dimension.key}
              >
                <span id={`detail-${categoryId}-${dimension.key}`}>
                  {dimension.label}
                </span>
                <span className="va-rate__scale">
                  {[1, 2, 3, 4, 5].map((value) => {
                    const chosen = answers[dimension.key] === value;
                    return (
                      <button
                        type="button"
                        key={value}
                        aria-label={`${dimension.label} ${value} of 5`}
                        aria-pressed={chosen}
                        onClick={() =>
                          save({
                            dimensions: {
                              [dimension.key]: chosen ? null : value,
                            },
                          })
                        }
                      >
                        {value}
                      </button>
                    );
                  })}
                </span>
              </div>
            ))}
            <div
              className="va-rate__last"
              role="group"
              aria-labelledby={`last-ate-${categoryId}`}
            >
              <p id={`last-ate-${categoryId}`} className="va-rate__subtitle">
                When did you last eat {food}? <span>optional</span>
              </p>
              <span className="va-rate__pills">
                {LAST_ATE.map((option) => {
                  const chosen = recency === option.value;
                  return (
                    <button
                      type="button"
                      key={option.value}
                      aria-pressed={chosen}
                      onClick={() =>
                        save({ recency: chosen ? null : option.value })
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </span>
              <p className="va-rate__note">
                Shows how close it seems to people who still eat it. It never
                changes how much your rating counts.
              </p>
            </div>
            {hasDetails && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  save({
                    dimensions: Object.fromEntries(
                      dimensions.map((d) => [d.key, null]),
                    ),
                    recency: null,
                  })
                }
              >
                Clear details
              </button>
            )}
          </fieldset>
        </div>
      ) : null}
      <p
        className="va-rate__status"
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
            onClick={() => save()}
          >
            Retry saving {state.selected}/5
          </button>
        )}
      {state?.status === "conflict" && (
        <p>
          This formula or its questions changed.{" "}
          <a href={productPath(country, productSlug)}>
            Open the current version
          </a>{" "}
          and rate it again.
        </p>
      )}
    </section>
  );
}
