import { useRef, useState } from "react";
import type { ImageSlot } from "@server/media/domain/media";
import { usePersonalState } from "../personal-state";
import { SLOT_LABELS } from "../photo-slots";
import { Notice } from "../ui/feedback";
import {
  rotatedPhoto,
  uploadProductPhoto,
} from "../../lib/product-photo-admin";

type Photo = { id: string; slot: string; hasEvidence: number };

/** Administrators fix a product's photos here; the cached page never changes. */
export function ProductPhotoAdmin({
  versionId,
  images,
  onChanged,
}: {
  versionId: string;
  images: Photo[];
  onChanged: (slot: ImageSlot, imageId: string) => void;
}) {
  const { user } = usePersonalState();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  if (!user?.administrator) return null;
  async function change(
    slot: ImageSlot,
    done: string,
    file: () => Promise<File> | File,
  ) {
    setBusy(true);
    setStatus("");
    setError("");
    try {
      onChanged(slot, await uploadProductPhoto(versionId, slot, await file()));
      setStatus(done);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The photo couldn’t be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="va-gallery__manage">
      <summary>Manage photos</summary>
      <ul className="va-photo-admin">
        {(Object.keys(SLOT_LABELS) as ImageSlot[]).map((slot) => {
          const image = images.find((i) => i.slot === slot);
          const label = SLOT_LABELS[slot];
          const rotate = (direction: "left" | "right") =>
            void change(slot, `${label} photo rotated.`, () =>
              rotatedPhoto(
                `/media/${image!.id}/${image!.hasEvidence ? "evidence" : "full"}`,
                slot,
                direction,
              ),
            );
          return (
            <li key={slot}>
              {image ? (
                <img
                  src={`/media/${image.id}/thumbnail`}
                  alt=""
                  width="56"
                  height="56"
                />
              ) : (
                <span className="va-photo-admin__empty" />
              )}
              <strong>{label}</strong>
              <div className="va-photo-admin__actions">
                {image && (
                  <>
                    <button
                      type="button"
                      className="button secondary small-button"
                      disabled={busy}
                      aria-label={`Rotate ${label} photo left`}
                      onClick={() => rotate("left")}
                    >
                      Rotate left
                    </button>
                    <button
                      type="button"
                      className="button secondary small-button"
                      disabled={busy}
                      aria-label={`Rotate ${label} photo right`}
                      onClick={() => rotate("right")}
                    >
                      Rotate right
                    </button>
                  </>
                )}
                <ChoosePhoto
                  action={image ? "Replace" : "Add"}
                  label={label}
                  disabled={busy}
                  onChoose={(file) =>
                    void change(
                      slot,
                      `${label} photo ${image ? "replaced" : "added"}.`,
                      () => file,
                    )
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p role="status" className="small">
        {busy ? "Saving photo…" : status}
      </p>
      {error && (
        <Notice tone="error" role="alert" title="Photo not saved">
          {error}
        </Notice>
      )}
    </details>
  );
}

function ChoosePhoto({
  action,
  label,
  disabled,
  onChoose,
}: {
  action: string;
  label: string;
  disabled: boolean;
  onChoose: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className="button secondary small-button"
        disabled={disabled}
        aria-label={`${action} ${label} photo`}
        onClick={() => input.current?.click()}
      >
        {action}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Photo file: ${label}`}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onChoose(file);
        }}
      />
    </>
  );
}
