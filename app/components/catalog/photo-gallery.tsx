import type { ImageSlot } from "@server/media/domain/media";
import { FoodIcon } from "../icons/food-icons";
import { Icon } from "../icons/icon";
import { Link } from "react-router";
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
                <div className="va-gallery__empty">
                  <FoodIcon slug={food} size={56} />
                  <span>No {SLOT_LABELS[slot].toLowerCase()} photo yet</span>
                  {canPropose && (
                    <Link
                      className="va-link va-small"
                      to={`/contribute/${productId}?action=photo&slot=${slot}`}
                    >
                      Add this photo
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="va-gallery__tabs">
        {SLOTS.map((slot) => {
          const image = images.find((i) => i.slot === slot);
          return (
            <label
              key={slot}
              htmlFor={`gallery-${slot}`}
              className={`va-gallery__tab va-gallery__tab--${slot}`}
              title={`${SLOT_LABELS[slot]}${image ? "" : " · No photo yet"}`}
            >
              {image ? (
                <img
                  src={`/media/${image.id}/thumbnail`}
                  alt=""
                  width={72}
                  height={72}
                  loading="lazy"
                />
              ) : (
                <span className="va-gallery__missing" aria-hidden="true">
                  <Icon name="camera" size={22} />
                  <span>{TAB_LABELS[slot]}</span>
                </span>
              )}
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
