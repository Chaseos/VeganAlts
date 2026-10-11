export interface ShelfGroup {
  id: string;
  name: string;
  shelves: { id: string; slug: string; name: string }[];
}

/**
 * Where a suggested food belongs: every shared shelf grouped by aisle,
 * including shelves that have no food yet.
 */
export function ShelfSelect({
  id,
  aisles,
  value,
  onChange,
  name,
  required = false,
  error,
  hint = "Where would you find it in a store?",
}: {
  id: string;
  aisles: ShelfGroup[];
  value?: string;
  onChange?: (shelfId: string) => void;
  name?: string;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  const hintId = `${id}-hint`,
    errorId = `${id}-error`;
  return (
    <>
      <label htmlFor={id}>Shelf{required ? " (required)" : ""}</label>
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
        <option value="">Choose a shelf</option>
        {aisles.map((aisle) => (
          <optgroup key={aisle.id} label={aisle.name}>
            {aisle.shelves.map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {shelf.name === aisle.name
                  ? shelf.name
                  : `${aisle.name} › ${shelf.name}`}
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
