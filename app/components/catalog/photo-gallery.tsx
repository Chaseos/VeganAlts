import type { ImageSlot } from "@server/media/domain/media";
import { FoodIcon } from "../icons/food-icons";
import { SLOT_LABELS } from "../photo-slots";

const SLOTS = Object.keys(SLOT_LABELS) as ImageSlot[];
// Short enough for five tabs on a phone; images keep the full slot name.
const TAB_LABELS: Record<ImageSlot, string> = {
  ...SLOT_LABELS,
  nutrition: "Nutrition",
};

/**
 * The five package photos (canvas: Product5). Native radios pick the slot
 * and CSS `:has()` shows it, so it works without JavaScript and under the
 * content security policy. Empty slots say so instead of hiding.
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
  const first =
    SLOTS.find((slot) => images.some((image) => image.slot === slot)) ??
    "front";
  return (
    <fieldset className="va-gallery">
      <legend className="sr-only">Package photos</legend>
      {SLOTS.map((slot) => (
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
        {SLOTS.map((slot) => {
          const image = images.find((i) => i.slot === slot);
          return (
            <div
              key={slot}
              className={`va-gallery__slide va-gallery__slide--${slot}`}
            >
              {image ? (
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
              ) : (
                <span className="va-gallery__empty">
                  <FoodIcon slug={food} size={56} />
                  <span>No {SLOT_LABELS[slot].toLowerCase()} photo yet</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="va-gallery__tabs">
        {SLOTS.map((slot) => (
          <label
            key={slot}
            htmlFor={`gallery-${slot}`}
            className={`va-gallery__tab va-gallery__tab--${slot}`}
          >
            {TAB_LABELS[slot]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
