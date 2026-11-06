import { useState } from "react";
import { groupCategories } from "../lib/navigation-groups";
import { t } from "../i18n";

export interface AisleOption {
  id: string;
  slug: string;
  name: string;
}

/**
 * Where a suggested food belongs: every shared aisle, including aisles that
 * have no food yet.
 */
export function AisleSelect({
  id,
  aisles,
  value,
  onChange,
  name,
  required = false,
  error,
  hint = t("aisle.hint"),
}: {
  id: string;
  aisles: AisleOption[];
  value?: string;
  onChange?: (aisleId: string) => void;
  name?: string;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  const hintId = `${id}-hint`,
    errorId = `${id}-error`;
  return (
    <>
      <label htmlFor={id}>
        {required ? t("aisle.labelRequired") : t("aisle.label")}
      </label>
      <select
        id={id}
        name={name}
        required={required}
        {...(onChange
          ? { value: value ?? "", onChange: (e) => onChange(e.target.value) }
          : { defaultValue: value ?? "" })}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
      >
        <option value="">{t("aisle.choose")}</option>
        {groupCategories(aisles).map((group) => (
          <optgroup key={group.id} label={group.name}>
            {group.categories.map((aisle) => (
              <option key={aisle.id} value={aisle.id}>
                {aisle.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p id={hintId} className="small muted">
        {hint}
      </p>
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </>
  );
}

/** Lets a contributor name the aisle they wish existed. Nothing waits on it. */
export function NewAisleField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(value !== "");
  const hintId = `${id}-hint`;
  if (!open)
    return (
      <p>
        <button
          type="button"
          className="link-button"
          onClick={() => setOpen(true)}
        >
          {t("aisle.noneFit")}
        </button>
      </p>
    );
  return (
    <>
      <label htmlFor={id}>{t("aisle.missingLabel")}</label>
      <input
        id={id}
        value={value}
        minLength={2}
        maxLength={160}
        aria-describedby={hintId}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={hintId} className="small muted">
        {t("aisle.missingHint")}
      </p>
    </>
  );
}
