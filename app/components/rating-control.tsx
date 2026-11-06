import { useEffect, useState } from "react";
import type { RatingInput } from "@server/ratings/domain/contracts";
import type { ConventionalRecency } from "@server/ratings/domain/details";
import { usePersonalState, ratingKey } from "./personal-state";
import { Turnstile } from "./turnstile";
import { productPath, useCountryCode } from "../lib/site-chrome";
import { t } from "../i18n";

export const scoreMeanings = () => [
  t("rating.close1"),
  t("rating.close2"),
  t("rating.close3"),
  t("rating.close4"),
  t("rating.close5"),
];
// The optional Tastiest answer (milestone 7): how tasty it is, whether or
// not it's like the original. It never changes Closest to the original.
export const tasteMeanings = () => [
  t("rating.taste1"),
  t("rating.taste2"),
  t("rating.taste3"),
  t("rating.taste4"),
  t("rating.taste5"),
];
export const lastAte = (): { value: ConventionalRecency; label: string }[] => [
  { value: "current_or_week", label: t("rating.lastWeek") },
  { value: "within_month", label: t("rating.lastMonth") },
  { value: "within_year", label: t("rating.lastYear") },
  { value: "over_year", label: t("rating.lastOver") },
  { value: "prefer_not_to_say", label: t("rating.lastNoSay") },
];
/** Shared presentation; the caller owns whether a repeated choice clears. */
export function NumberedScale({
  selected,
  onChoose,
  meanings = scoreMeanings(),
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
            aria-label={`${label ? `${label}: ` : ""}${index + 1} ${meaning} ${t("rating.position", { number: index + 1 })}`}
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
      meanings={tasteMeanings()}
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
    <section className="va-rate" aria-label={t("rating.rateAs", { food })}>
      <noscript>
        <p className="notice">{t("rating.noscript")}</p>
      </noscript>
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
            {flavored
              ? t("rating.closeQuestionFlavored", { food })
              : t("rating.closeQuestion", { food })}
          </legend>
          <OverallScale
            selected={state?.selected}
            onChoose={(score) =>
              save({ score: score === state?.selected ? null : score })
            }
          />
          <p id={helpId} className="va-rate__help">
            {user === null ? t("rating.helpSignedOut") : t("rating.help")}
          </p>
        </fieldset>
        <fieldset className="va-rate__group va-rate__tasty" disabled={disabled}>
          <legend className="va-rate__subtitle">
            {t("rating.tastyQuestion")}
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
            {t("rating.addDetail")}{" "}
            <span>
              {hasDetails ? t("rating.yourAnswers") : t("rating.optional")}
            </span>
          </summary>
          <fieldset disabled={state.status === "conflict"}>
            <legend className="sr-only">{t("rating.detailLegend")}</legend>
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
                {t("rating.lastAteQuestion", { food })}{" "}
                <span>{t("rating.optionalWord")}</span>
              </p>
              <span className="va-rate__pills">
                {lastAte().map((option) => {
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
              <p className="va-rate__note">{t("rating.recencyNote")}</p>
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
                {t("rating.clearDetails")}
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
              ? t("rating.loading")
              : state?.selected
                ? `${t("rating.yours", { score: state.selected })}${enjoyment ? ` · ${t("rating.tasteScore", { taste: enjoyment })}` : ""}`
                : enjoyment
                  ? t("rating.yoursTaste", { taste: enjoyment })
                  : "")}
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" className="text-button" onClick={retryLoad}>
            {t("rating.retry")}
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
          {t("rating.retrySaving", {
            target: state.selected
              ? `${state.selected}/5`
              : enjoyment
                ? t("rating.tasteTarget", { taste: enjoyment })
                : t("rating.removalTarget"),
          })}
        </button>
      )}
      {state?.status === "conflict" && (
        <p>
          {t("rating.conflict")}{" "}
          <a href={productPath(country, productSlug)}>
            {t("rating.openCurrent")}
          </a>{" "}
          {t("rating.rateAgain")}
        </p>
      )}
    </section>
  );
}
