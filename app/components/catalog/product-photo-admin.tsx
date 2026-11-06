import { useRef, useState } from "react";
import type { ImageSlot } from "@server/media/domain/media";
import { shrinkPhoto } from "../../lib/shrink-photo";
import { usePersonalState } from "../personal-state";
import { IMAGE_SLOTS, slotLabel } from "../photo-slots";
import { Notice } from "../ui/feedback";
import { t } from "../../i18n";
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
        failure instanceof Error ? failure.message : t("photoAdmin.saveFailed"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="va-gallery__manage">
      <summary>{t("photoAdmin.manage")}</summary>
      <ul className="va-photo-admin">
        {IMAGE_SLOTS.map((slot) => {
          const image = images.find((i) => i.slot === slot);
          const label = slotLabel(slot);
          const rotate = (direction: "left" | "right") =>
            void change(slot, t("photoAdmin.rotated", { slot: label }), () =>
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
                      aria-label={t("photoAdmin.rotateLeftLabel", {
                        slot: label,
                      })}
                      onClick={() => rotate("left")}
                    >
                      {t("photoAdmin.rotateLeft")}
                    </button>
                    <button
                      type="button"
                      className="button secondary small-button"
                      disabled={busy}
                      aria-label={t("photoAdmin.rotateRightLabel", {
                        slot: label,
                      })}
                      onClick={() => rotate("right")}
                    >
                      {t("photoAdmin.rotateRight")}
                    </button>
                  </>
                )}
                <ChoosePhoto
                  action={image ? "replace" : "add"}
                  label={label}
                  disabled={busy}
                  onChoose={(file) =>
                    void change(
                      slot,
                      t(image ? "photoAdmin.replaced" : "photoAdmin.added", {
                        slot: label,
                      }),
                      () => shrinkPhoto(file),
                    )
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p role="status" className="small">
        {busy ? t("photoAdmin.saving") : status}
      </p>
      {error && (
        <Notice tone="error" role="alert" title={t("photoAdmin.notSaved")}>
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
  action: "replace" | "add";
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
        aria-label={t(
          action === "replace"
            ? "photoAdmin.replaceLabel"
            : "photoAdmin.addLabel",
          { slot: label },
        )}
        onClick={() => input.current?.click()}
      >
        {action === "replace" ? t("photoAdmin.replace") : t("photoAdmin.add")}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={t("photoAdmin.file", { slot: label })}
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
