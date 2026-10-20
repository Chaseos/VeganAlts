import type { ImageSlot } from "@server/media/domain/media";
import { FoodIcon } from "../icons/food-icons";
import { SLOT_LABELS } from "../photo-slots";

const SLOTS = Object.keys(SLOT_LABELS) as ImageSlot[];

/**
 * Available package photos. Native radios pick the slot
 * and CSS `:has()` shows it, so it works without JavaScript and under the
 * content security policy. Missing categories live in the photo editor.
 */
export function PhotoGallery({
  productName,
  food,
  images,
}: {
  productName: string;
  food: string;
  images: { id: string; slot: string; hasEvidence: number }[];
}) {
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
  const first = photos[0]!.slot;
  return (
    <fieldset className="va-gallery">
      <legend className="sr-only">Package photos</legend>
      {photos.map(({ slot }) => (
        <input
          key={slot}
          className="va-gallery__radio sr-only"
          type="radio"
          name="gallery-slot"
          id={`gallery-${slot}`}
          value={slot}
          defaultChecked={slot === first}
        />
      ))}
      <div className="va-gallery__stage">
        {photos.map((image) => {
          const { slot } = image;
          return (
            <div
              key={slot}
              className={`va-gallery__slide va-gallery__slide--${slot}`}
            >
              <a
                href={`/media/${image.id}/${image.hasEvidence ? "evidence" : "full"}`}
              >
                <img
                  src={`/media/${image.id}/full`}
                  alt={`${productName}: ${SLOT_LABELS[slot]}`}
                  width={420}
                  height={420}
                  loading={slot === first ? "eager" : "lazy"}
                />
              </a>
            </div>
          );
        })}
      </div>
      <div className="va-gallery__tabs">
        {photos.map((image) => {
          const { slot } = image;
          return (
            <label
              key={slot}
              htmlFor={`gallery-${slot}`}
              className={`va-gallery__tab va-gallery__tab--${slot}`}
              title={SLOT_LABELS[slot]}
            >
              <img
                src={`/media/${image.id}/thumbnail`}
                alt=""
                width={72}
                height={72}
                loading="lazy"
              />
              <span className="sr-only">{SLOT_LABELS[slot]}</span>
            </label>
          );
        })}
      </div>
      <p className="va-gallery__hint">
        Select a photo. Open it to view full size.
      </p>
    </fieldset>
  );
}
