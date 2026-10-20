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
// The optional Tastiest answer (milestone 7): how tasty it is, whether or
// not it's like the original. It never changes Closest to the original.
export const TASTE_MEANINGS = [
  "Not for me",
  "It’s OK",
  "Good",
  "Really good",
  "Delicious",
];
export const LAST_ATE: { value: ConventionalRecency; label: string }[] = [
  { value: "current_or_week", label: "This week" },
  { value: "within_month", label: "This month" },
  { value: "within_year", label: "This year" },
  { value: "over_year", label: "Over a year ago" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];
/** Shared presentation; the caller owns whether a repeated choice clears. */
export function NumberedScale({
  selected,
  onChoose,
  meanings = SCORE_MEANINGS,
  label,
}: {
  selected: number | null | undefined;
  onChoose: (value: number) => void;
  meanings?: readonly string[];
  label?: string;
}) {
  return (
    <div className="va-numbered-scale">
      <div className="va-numbered-scale__buttons">
        {meanings.map((meaning, index) => (
          <button
            type="button"
            key={meaning}
            aria-label={`${label ? `${label}: ` : ""}${index + 1} ${meaning} (${index + 1} of 5)`}
            aria-pressed={selected === index + 1}
            onClick={() => onChoose(index + 1)}
          >
            <span className="va-rate__number">{index + 1}</span>{" "}
            <span className="va-rate__meaning">{meaning}</span>
          </button>
        ))}
      </div>
      <p className="va-rate__ends" aria-hidden="true">
        <span>{meanings[0]}</span>
        <span>{meanings[4]}</span>
      </p>
    </div>
  );
}

/** The Tastiest answer is optional; tapping the chosen one clears it. */
export function TasteScale({
  selected,
  onChoose,
}: {
  selected: number | null | undefined;
  onChoose: (value: number | null) => void;
}) {
  return (
    <NumberedScale
      selected={selected}
      meanings={TASTE_MEANINGS}
      onChoose={(value) => onChoose(value === selected ? null : value)}
    />
  );
}
/** The five overall-similarity buttons, labeled with what each score means. */
export function OverallScale({
  selected,
  onChoose,
}: {
  selected: number | null | undefined;
  onChoose: (score: number) => void;
}) {
  return <NumberedScale selected={selected} onChoose={onChoose} />;
}
export interface RatingQuestion {
  key: string;
  label: string;
}

/** Either answer saves independently; comparison details follow closeness. */
export function RatingControl({
  versionId,
  categoryId,
  categoryName,
  productSlug,
  productName,
  flavor,
  foodSlug,
  dimensions,
  flavored = false,
}: {
  versionId: string;
  categoryId: string;
  categoryName: string;
  productSlug: string;
  productName: string;
  flavor: string | null;
  foodSlug?: string;
  dimensions: RatingQuestion[];
  // A flavored product is compared with the food in the same flavor.
  flavored?: boolean;
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
  const enjoyment = state?.enjoyment ?? null;
  const disabled = user === undefined || state?.status === "conflict";
  const hasDetails =
    recency !== null || dimensions.some((d) => answers[d.key] !== undefined);
  // Each write carries the whole draft so the newest one wins outright.
  function save(
    change: {
      score?: number | null;
      dimensions?: Record<string, number | null>;
      recency?: ConventionalRecency | null;
      enjoyment?: number | null;
    } = {},
  ) {
    const score =
      change.score !== undefined ? change.score : (state?.selected ?? null);
    const draft: RatingInput = {
      productVersionId: versionId,
      categoryId,
      overallSimilarity: score,
      dimensions: Object.fromEntries(
        dimensions.map((d) => [
          d.key,
          score === null
            ? null
            : change.dimensions && d.key in change.dimensions
              ? change.dimensions[d.key]!
              : (answers[d.key] ?? null),
        ]),
      ),
      conventionalRecency:
        score === null
          ? null
          : change.recency !== undefined
            ? change.recency
            : recency,
      enjoyment: change.enjoyment !== undefined ? change.enjoyment : enjoyment,
      ...(token ? { challengeToken: token } : {}),
    };
    select(draft, returnTo);
    setToken("");
  }
  const helpId = `rating-help-${categoryId}`;
  return (
    <section className="va-rate" aria-label={`Rate it as ${food}`}>
      <p className="va-rate__product">
        {productName}
        {flavor ? ` · ${flavor}` : ""}
      </p>
      <div className="va-rate__scores">
        <fieldset
          className="va-rate__group"
          disabled={disabled}
          aria-describedby={helpId}
        >
          <legend className="va-rate__title">
            Tried it? How close is it to {food}
            {flavored ? " in the same flavor" : ""}?
          </legend>
          <OverallScale
            selected={state?.selected}
            onChoose={(score) =>
              save({ score: score === state?.selected ? null : score })
            }
          />
          <p id={helpId} className="va-rate__help">
            {user === null
              ? "Choose a score; you’ll sign in to save it."
              : "Rate either question or both. Each choice saves right away; tap it again to clear. Your rating marks this formula as tried."}
          </p>
        </fieldset>
        <fieldset className="va-rate__group va-rate__tasty" disabled={disabled}>
          <legend className="va-rate__subtitle">
            How tasty is it, whether or not it’s like the original?
          </legend>
          <TasteScale
            selected={enjoyment}
            onChoose={(value) => save({ enjoyment: value })}
          />
        </fieldset>
      </div>
      {state?.selected ? (
        <details className="va-rate__more">
          <summary className="va-rate__subtitle">
            Add detail{" "}
            <span>{hasDetails ? "· your answers" : "· optional"}</span>
          </summary>
          <fieldset disabled={state.status === "conflict"}>
            <legend className="sr-only">Detail ratings and last ate</legend>
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
                <NumberedScale
                  selected={answers[dimension.key]}
                  label={dimension.label}
                  onChoose={(value) =>
                    save({
                      dimensions: {
                        [dimension.key]:
                          answers[dimension.key] === value ? null : value,
                      },
                    })
                  }
                />
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
        </details>
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
                ? `Your rating: ${state.selected}/5${enjoyment ? ` · Taste: ${enjoyment}/5` : ""}`
                : enjoyment
                  ? `Your taste rating: ${enjoyment}/5`
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
      {(state?.status === "error" || state?.status === "challenge") && (
        <button
          className="button secondary"
          type="button"
          disabled={state.status === "challenge" && !token}
          onClick={() => save()}
        >
          Retry saving{" "}
          {state.selected
            ? `${state.selected}/5`
            : enjoyment
              ? `taste ${enjoyment}/5`
              : "rating removal"}
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
