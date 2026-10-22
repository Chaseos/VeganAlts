import { useId, useRef, useState } from "react";
import type { ImageSlot } from "@server/media/domain/media";
import { FoodIcon } from "../icons/food-icons";
import { SLOT_LABELS } from "../photo-slots";
import { useHydrated } from "../../lib/use-hydrated";
import { usePhotoSwipe } from "../../lib/use-photo-swipe";
import { ProductThumbnail } from "./product-thumbnail";

const SLOTS = Object.keys(SLOT_LABELS) as ImageSlot[];

/** Native thumbnail selection works without JS; hydration adds arrows and swipe. */
export function PhotoGallery({
  productName,
  food,
  images,
  onOpenPhoto,
}: {
  productName: string;
  food: string;
  images: { id: string; slot: string; hasEvidence: number }[];
  onOpenPhoto?: (id: string, opener: HTMLAnchorElement) => void;
}) {
  const id = useId();
  const hydrated = useHydrated();
  const [active, setActive] = useState(0);
  const radios = useRef<(HTMLInputElement | null)[]>([]);
  const photos = SLOTS.flatMap((slot) => {
    const image = images.find((image) => image.slot === slot);
    return image ? [{ ...image, slot }] : [];
  });
  const swipe = usePhotoSwipe((direction) => {
    if (photos.length > 1) step(direction);
  });
  if (!photos.length)
    return (
      <div className="va-gallery__empty">
        <FoodIcon slug={food} size={40} />
        <span>No photos yet</span>
      </div>
    );
  function step(direction: number) {
    // Programmatic selection keeps focus, and therefore scroll, where it is.
    radios.current[
      (active + direction + photos.length) % photos.length
    ]?.click();
  }
  return (
    <fieldset className="va-gallery" aria-roledescription="carousel">
      <legend className="sr-only">Package photos</legend>
      <div className="va-gallery__stage" {...swipe}>
        <div className="va-gallery__track">
          {photos.map((image, index) => (
            <div
              key={image.slot}
              className={`va-gallery__slide va-gallery__slide--${image.slot}`}
            >
              <a
                href={`/media/${image.id}/${image.hasEvidence ? "evidence" : "full"}`}
                aria-haspopup={onOpenPhoto ? "dialog" : undefined}
                onClick={(event) => {
                  if (
                    !onOpenPhoto ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onOpenPhoto(image.id, event.currentTarget);
                }}
              >
                <img
                  src={`/media/${image.id}/full`}
                  alt={`${productName}: ${SLOT_LABELS[image.slot]}`}
                  width={420}
                  height={420}
                  loading={index === 0 ? "eager" : "lazy"}
                  draggable={false}
                />
              </a>
            </div>
          ))}
        </div>
        {hydrated && photos.length > 1 && (
          <div className="va-gallery__controls">
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => step(-1)}
            >
              ‹
            </button>
            <span aria-live="polite" aria-atomic="true">
              {active + 1} of {photos.length}
            </span>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => step(1)}
            >
              ›
            </button>
          </div>
        )}
      </div>
      <div className="va-gallery__tabs">
        {photos.map((image, index) => (
          <label
            key={image.slot}
            className={`va-gallery__tab va-gallery__tab--${image.slot}`}
            title={SLOT_LABELS[image.slot]}
          >
            <input
              ref={(element) => {
                radios.current[index] = element;
              }}
              className="va-gallery__radio sr-only"
              type="radio"
              name={`gallery-${id}`}
              value={image.slot}
              defaultChecked={index === 0}
              onChange={() => setActive(index)}
            />
            <ProductThumbnail imageId={image.id} food={food} size="small" />
            <span className="sr-only">{SLOT_LABELS[image.slot]}</span>
          </label>
        ))}
      </div>
      <p className="va-gallery__hint">
        Select a photo. Open it to view full size.
      </p>
    </fieldset>
  );
}
