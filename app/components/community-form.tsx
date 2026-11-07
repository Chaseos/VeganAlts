import { Link } from "react-router";
import type { CommunityAction } from "../lib/community";
import { Turnstile } from "./turnstile";
import type { ImageSlot } from "@server/media/domain/media";
import { t } from "../i18n";

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
        role={action.error ? (action.checking ? "status" : "alert") : undefined}
        className={
          action.error ? (action.checking ? "notice" : "form-error") : ""
        }
      >
        {action.error}
        {action.checking && (
          <>
            {" "}
            <Link to="/my-contributions">{t("community.viewChecks")}</Link>
            {t("community.viewChecksAfter")}
          </>
        )}
        {action.sessionExpired && (
          <>
            {" "}
            <a href="/sign-in" target="_blank" rel="noopener">
              {t("community.signInAgain")}
            </a>
            {t("community.signInAgainAfter")}
          </>
        )}
      </div>
      {action.challenge && (
        <Turnstile
          key={action.challengeAttempt}
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
  noteLabel = t("community.evidenceNote"),
  reviewed = true,
}: {
  prefix?: string;
  required?: boolean;
  noteLabel?: string;
  // False where a change applies without an operator's review.
  reviewed?: boolean;
}) {
  return (
    <>
      <label htmlFor={`${prefix}-note`}>{noteLabel}</label>
      <textarea
        id={`${prefix}-note`}
        name="note"
        required={required}
        minLength={8}
        maxLength={2000}
        rows={4}
      />
      <label htmlFor={`${prefix}-url`}>{t("community.sourceUrl")}</label>
      <input
        id={`${prefix}-url`}
        name="evidenceUrl"
        type="url"
        placeholder="https://manufacturer.example/ingredients"
        maxLength={1000}
      />
      <p className="small muted">
        {t("community.evidenceHint")}
        {reviewed && ` ${t("community.evidenceReviewed")}`}
      </p>
    </>
  );
}
export function ManufacturerField({ value = "unknown" }: { value?: string }) {
  return (
    <>
      <label htmlFor="manufacturer-label">
        {t("community.manufacturerLabel")}
      </label>
      <select
        id="manufacturer-label"
        name="manufacturerLabel"
        defaultValue={value}
      >
        <option value="unknown">{t("community.manufacturerUnknown")}</option>
        <option value="vegan">{t("community.manufacturerVegan")}</option>
        <option value="plant_based">
          {t("community.manufacturerPlantBased")}
        </option>
        <option value="neither">{t("community.manufacturerNeither")}</option>
      </select>
    </>
  );
}
const slotLabel = (slot: ImageSlot) =>
  ({
    front: t("community.slotFront"),
    back: t("community.slotBack"),
    ingredients: t("community.slotIngredients"),
    nutrition: t("community.slotNutrition"),
    prepared: t("community.slotPrepared"),
  })[slot];
export function PhotoPicker({
  slot,
  file,
  onChange,
  required = false,
  label,
  error,
}: {
  slot: ImageSlot;
  file?: File;
  onChange: (file: File | undefined) => void;
  required?: boolean;
  label?: string;
  // Shown under the field and announced with it.
  error?: string;
}) {
  const errorId = `photo-${slot}-error`;
  return (
    <div className="photo-picker">
      <label htmlFor={`photo-${slot}`}>
        {label ?? slotLabel(slot)}
        {required
          ? ` ${t("community.required")}`
          : ` ${t("community.optional")}`}
      </label>
      <input
        id={`photo-${slot}`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required && !file}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.files?.[0])}
      />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
      {file && <ChosenPhoto file={file} />}
    </div>
  );
}
// A thumbnail of a picked photo (a blob: URL, never uploaded until submit).
function ChosenPhoto({ file }: { file: File }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <p className="photo-picker__chosen">
      {preview && <img src={preview} alt="" width={56} height={56} />}
      <span className="small">
        {t("community.selected", { name: file.name })}
      </span>
    </p>
  );
}
import { useEffect, useState, type ReactNode } from "react";

// These forms require client handlers. Keep their controls disabled during SSR
// hydration so an early edit cannot be lost or an operator effect ignored.
export function CommunityControls({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return (
    <>
      <noscript>
        <p className="notice">{t("community.noScript")}</p>
      </noscript>
      <fieldset
        className="community-controls"
        disabled={!ready}
        aria-busy={!ready}
      >
        {children}
      </fieldset>
    </>
  );
}

/** Points contributors at the published rules before they submit. */
export function GuidelinesNote() {
  return (
    <p className="small guidelines-note">
      {t("community.guidelinesBefore")}
      {t("text.gap")}
      <Link to="/about/terms">{t("community.guidelinesLink")}</Link>
      {t("text.gap")}
      {t("community.guidelinesMiddle")}
      {t("text.gap")}
      <Link to="/about/moderation">{t("community.moderationLink")}</Link>
      {t("community.guidelinesAfter")}
    </p>
  );
}
