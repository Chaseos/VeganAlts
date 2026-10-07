import type { CommunityAction } from "../lib/community";
import { Turnstile } from "./turnstile";
import type { ImageSlot } from "@server/media/domain/media";

export function CommunityFeedback({
  action,
  siteKey,
}: {
  action: CommunityAction;
  siteKey: string;
}) {
  return (
    <>
      <div
        ref={action.errorRef}
        tabIndex={-1}
        role={action.error ? "alert" : undefined}
        className={action.error ? "form-error" : ""}
      >
        {action.error}
      </div>
      {action.challenge && (
        <Turnstile
          siteKey={siteKey}
          action="community"
          onToken={action.setToken}
        />
      )}
    </>
  );
}
export function EvidenceFields({
  prefix = "evidence",
  required = true,
}: {
  prefix?: string;
  required?: boolean;
}) {
  return (
    <>
      <label htmlFor={`${prefix}-note`}>What does the evidence show?</label>
      <textarea
        id={`${prefix}-note`}
        name="note"
        required={required}
        minLength={8}
        maxLength={2000}
        rows={4}
      />
      <label htmlFor={`${prefix}-url`}>Source URL (optional)</label>
      <input
        id={`${prefix}-url`}
        name="evidenceUrl"
        type="url"
        placeholder="https://manufacturer.example/ingredients"
        maxLength={1000}
      />
      <p className="small muted">
        Link directly to relevant manufacturer or certification information. An
        operator reviews the evidence before changing the catalog.
      </p>
    </>
  );
}
export function ManufacturerField({ value = "unknown" }: { value?: string }) {
  return (
    <>
      <label htmlFor="manufacturer-label">Manufacturer wording</label>
      <select
        id="manufacturer-label"
        name="manufacturerLabel"
        defaultValue={value}
      >
        <option value="unknown">Not sure / not stated</option>
        <option value="vegan">Labeled vegan</option>
        <option value="plant_based">Labeled plant-based</option>
        <option value="neither">Neither wording</option>
      </select>
    </>
  );
}
export function PhotoPicker({
  slot,
  file,
  onChange,
  required = false,
}: {
  slot: ImageSlot;
  file?: File;
  onChange: (file: File | undefined) => void;
  required?: boolean;
}) {
  return (
    <div className="photo-picker">
      <label htmlFor={`photo-${slot}`}>
        {slot === "front"
          ? "Front photo"
          : slot === "ingredients"
            ? "Ingredient-panel photo"
            : `${slot[0]!.toUpperCase()}${slot.slice(1)} photo`}
        {required ? " (required)" : " (optional)"}
      </label>
      <input
        id={`photo-${slot}`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required && !file}
        onChange={(event) => onChange(event.target.files?.[0])}
      />
      {file && <p className="small">Selected: {file.name}</p>}
    </div>
  );
}
import { useEffect, useState, type ReactNode } from "react";

// These forms require client handlers. Keep their controls disabled during SSR
// hydration so an early edit cannot be lost or an operator effect ignored.
export function CommunityControls({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <fieldset
      className="community-controls"
      disabled={!ready}
      aria-busy={!ready}
    >
      {children}
    </fieldset>
  );
}
