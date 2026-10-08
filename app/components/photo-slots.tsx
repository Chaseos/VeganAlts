import { Link } from "react-router";

const SLOTS = [
  "front",
  "back",
  "ingredients",
  "nutrition",
  "prepared",
] as const;
const LABELS: Record<(typeof SLOTS)[number], string> = {
  front: "Front",
  back: "Back",
  ingredients: "Ingredients",
  nutrition: "Nutrition & allergens",
  prepared: "Prepared",
};

/**
 * One canonical photo per slot instead of an append-only gallery. A filled
 * slot offers a replacement proposal; earlier photos stay with their formula.
 */
export function PhotoSlots({
  productId,
  productName,
  images,
  canPropose,
}: {
  productId: string;
  productName: string;
  images: { id: string; slot: string; hasEvidence: number }[];
  canPropose: boolean;
}) {
  return (
    <section aria-labelledby="photo-slots">
      <h2 id="photo-slots">Product photos</h2>
      <ul className="photo-slots">
        {SLOTS.map((slot) => {
          const image = images.find((i) => i.slot === slot);
          return (
            <li key={slot}>
              {image ? (
                <a
                  href={`/media/${image.id}/${image.hasEvidence ? "evidence" : "full"}`}
                >
                  <img
                    src={`/media/${image.id}/thumbnail`}
                    alt={`${productName}: ${LABELS[slot]}`}
                    width="100"
                    height="100"
                    loading="lazy"
                  />
                </a>
              ) : (
                <span className="photo-slot-empty" aria-hidden="true" />
              )}
              <strong>{LABELS[slot]}</strong>
              {canPropose && (
                <Link
                  className="small"
                  to={`/contribute/${productId}?action=photo&slot=${slot}`}
                  // The accessible name starts with the visible text.
                  aria-label={`${image ? "Suggest a better photo" : "Add photo"}: ${LABELS[slot]}`}
                >
                  {image ? "Suggest a better photo" : "Add photo"}
                </Link>
              )}
              {image && (
                <Link
                  className="small"
                  to={`/contribute/${productId}?action=report&image=${image.id}`}
                  aria-label={`Report photo: ${LABELS[slot]}`}
                >
                  Report photo
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
