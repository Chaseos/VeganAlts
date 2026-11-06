import { Link } from "react-router";
import type { ImageSlot } from "@server/media/domain/media";
import { t, type MessageKey } from "../i18n";
import { en } from "../i18n/en";

/** Canonical slot order shared by every photo control. */
export const IMAGE_SLOTS = [
  "front",
  "back",
  "ingredients",
  "nutrition",
  "prepared",
] as const satisfies readonly ImageSlot[];

const LABEL_KEYS = {
  front: "photo.front",
  back: "photo.back",
  ingredients: "photo.ingredients",
  nutrition: "photo.nutrition",
  prepared: "photo.prepared",
} as const satisfies Record<ImageSlot, MessageKey>;

export const slotLabel = (slot: ImageSlot) => t(LABEL_KEYS[slot]);
/** For notes saved as data, which stay in English. */
export const storedSlotLabel = (slot: ImageSlot) => en[LABEL_KEYS[slot]];

/**
 * One canonical photo per slot instead of an append-only gallery. A filled
 * slot offers a replacement proposal; earlier photos stay with their formula.
 */
export function PhotoSlots({
  productId,
  productName,
  images,
  canPropose,
  onOpenPhoto,
}: {
  productId: string;
  productName: string;
  images: { id: string; slot: string; hasEvidence: number }[];
  canPropose: boolean;
  onOpenPhoto?: (id: string, opener: HTMLAnchorElement) => void;
}) {
  return (
    <section aria-labelledby="photo-slots">
      <h2 id="photo-slots">{t("photo.heading")}</h2>
      <ul className="photo-slots">
        {IMAGE_SLOTS.map((slot) => {
          const image = images.find((i) => i.slot === slot);
          return (
            <li key={slot}>
              {image ? (
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
                    src={`/media/${image.id}/thumbnail`}
                    alt={`${productName}: ${slotLabel(slot)}`}
                    width="100"
                    height="100"
                    loading="lazy"
                  />
                </a>
              ) : (
                <span className="photo-slot-empty" aria-hidden="true" />
              )}
              <strong>{slotLabel(slot)}</strong>
              {canPropose && (
                <Link
                  className="small"
                  to={`/contribute/${productId}?action=photo&slot=${slot}`}
                  // The accessible name starts with the visible text.
                  aria-label={`${t(image ? "photo.suggestBetter" : "photo.add")}: ${slotLabel(slot)}`}
                >
                  {t(image ? "photo.suggestBetter" : "photo.add")}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
