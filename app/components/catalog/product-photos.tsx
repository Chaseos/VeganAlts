import { useEffect, useId, useRef, useState } from "react";
import type { ImageSlot } from "@server/media/domain/media";
import { PhotoSlots, SLOT_LABELS } from "../photo-slots";
import { Icon } from "../icons/icon";
import { usePhotoSwipe } from "../../lib/use-photo-swipe";
import { useHydrated } from "../../lib/use-hydrated";
import { PhotoGallery } from "./photo-gallery";

/** One viewer for both the gallery and the photo contribution slots. */
export function ProductPhotos({
  productId,
  productName,
  food,
  images,
  canPropose,
}: {
  productId: string;
  productName: string;
  food: string;
  images: { id: string; slot: string; hasEvidence: number }[];
  canPropose: boolean;
}) {
  const hydrated = useHydrated();
  const photos = (Object.keys(SLOT_LABELS) as ImageSlot[]).flatMap((slot) => {
    const photo = images.find((image) => image.slot === slot);
    return photo ? [{ ...photo, slot }] : [];
  });
  const [active, setActive] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLAnchorElement | null>(null);
  const titleId = useId();
  const captionId = useId();
  const photo = active === null ? null : photos[active];
  const step = (direction: number) =>
    setActive((index) =>
      index === null
        ? null
        : (index + direction + photos.length) % photos.length,
    );
  const swipe = usePhotoSwipe(step);
  const close = () => dialog.current?.close();
  function openPhoto(id: string, anchor: HTMLAnchorElement) {
    const index = photos.findIndex((image) => image.id === id);
    if (index < 0) return;
    opener.current = anchor;
    setActive(index);
  }
  useEffect(() => {
    if (active !== null && !dialog.current?.open) dialog.current?.showModal();
  }, [active]);
  return (
    <div className="va-product__photos">
      <PhotoGallery
        productName={productName}
        food={food}
        images={images}
        onOpenPhoto={hydrated ? openPhoto : undefined}
      />
      <details className="va-gallery__manage">
        <summary>Add or improve photos</summary>
        <PhotoSlots
          productId={productId}
          productName={productName}
          images={images}
          canPropose={canPropose}
          onOpenPhoto={hydrated ? openPhoto : undefined}
        />
      </details>
      <dialog
        ref={dialog}
        className="va-photo-viewer"
        aria-labelledby={titleId}
        aria-describedby={captionId}
        onClose={() => {
          setActive(null);
          opener.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            step(event.key === "ArrowRight" ? 1 : -1);
          }
        }}
      >
        <div className="va-photo-viewer__body">
          <div className="va-photo-viewer__header">
            <h2 id={titleId} className="va-heading-s">
              {productName} photos
            </h2>
            <button
              type="button"
              className="va-icon-button"
              aria-label="Close full-size photos"
              onClick={close}
              autoFocus
            >
              <Icon name="close" size={24} />
            </button>
          </div>
          <div className="va-photo-viewer__stage" {...swipe}>
            {photo && (
              <ViewerImage
                key={photo.id}
                src={`/media/${photo.id}/${photo.hasEvidence ? "evidence" : "full"}`}
                alt={`${productName}: ${SLOT_LABELS[photo.slot]}`}
              />
            )}
          </div>
          <div className="va-photo-viewer__footer">
            {photos.length > 1 && (
              <button
                type="button"
                className="va-icon-button"
                aria-label="Previous full-size photo"
                onClick={() => step(-1)}
              >
                ‹
              </button>
            )}
            <p id={captionId} aria-live="polite" aria-atomic="true">
              {photo &&
                `${SLOT_LABELS[photo.slot]} · ${active! + 1} of ${photos.length}`}
            </p>
            {photos.length > 1 && (
              <button
                type="button"
                className="va-icon-button"
                aria-label="Next full-size photo"
                onClick={() => step(1)}
              >
                ›
              </button>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}

function ViewerImage({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  return (
    <>
      {state === "loading" && (
        <p className="va-photo-viewer__status" role="status">
          Loading photo…
        </p>
      )}
      {state === "error" ? (
        <div className="va-photo-viewer__status" role="alert">
          <p>This photo couldn’t load.</p>
          <button
            className="button secondary"
            onClick={() => {
              setState("loading");
              setAttempt((value) => value + 1);
            }}
          >
            Retry photo
          </button>
        </div>
      ) : (
        <img
          key={attempt}
          src={attempt ? `${src}?retry=${attempt}` : src}
          alt={alt}
          draggable={false}
          onLoad={() => setState("ready")}
          onError={() => setState("error")}
        />
      )}
    </>
  );
}
