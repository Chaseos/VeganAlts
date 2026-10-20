import { groupCategories } from "../lib/navigation-groups";

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
  hint = "Choose the broad category this food belongs to.",
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
      <label htmlFor={id}>Category{required ? " (required)" : ""}</label>
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
        <option value="">Choose a category</option>
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
