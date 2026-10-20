import { useId, useRef, useState } from "react";
import type { ImageSlot } from "@server/media/domain/media";
import { FoodIcon } from "../icons/food-icons";
import { SLOT_LABELS } from "../photo-slots";
import { useHydrated } from "../../lib/use-hydrated";

const SLOTS = Object.keys(SLOT_LABELS) as ImageSlot[];

/** Native thumbnail selection works without JS; hydration adds arrows and swipe. */
export function PhotoGallery({
  productName,
  food,
  images,
}: {
  productName: string;
  food: string;
  images: { id: string; slot: string; hasEvidence: number }[];
}) {
  const id = useId();
  const hydrated = useHydrated();
  const [active, setActive] = useState(0);
  const radios = useRef<(HTMLInputElement | null)[]>([]);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const photos = SLOTS.flatMap((slot) => {
    const image = images.find((image) => image.slot === slot);
    return image ? [{ ...image, slot }] : [];
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
      <div
        className="va-gallery__stage"
        onPointerDown={(event) => {
          swiped.current = false;
          gesture.current = event.isPrimary
            ? { id: event.pointerId, x: event.clientX, y: event.clientY }
            : null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onPointerUp={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (!start || start.id !== event.pointerId || photos.length < 2)
            return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            swiped.current = true;
            step(dx < 0 ? 1 : -1);
          }
        }}
        onClickCapture={(event) => {
          if (swiped.current) {
            swiped.current = false;
            // A drag may synthesize a click on the full-size link. Keyboard
            // activation has detail 0 and must remain available after a swipe.
            if (event.detail > 0) {
              event.preventDefault();
              event.stopPropagation();
            }
          }
        }}
      >
        <div className="va-gallery__track">
          {photos.map((image, index) => (
            <div
              key={image.slot}
              className={`va-gallery__slide va-gallery__slide--${image.slot}`}
            >
              <a
                href={`/media/${image.id}/${image.hasEvidence ? "evidence" : "full"}`}
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
            <img
              src={`/media/${image.id}/thumbnail`}
              alt=""
              width={72}
              height={72}
              loading="lazy"
              draggable={false}
            />
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
