import { PhotoPicker } from "../community-form";
import type { PhotoSlot } from "../../lib/product-draft";

/** Every photo of a new product, together: only the front is required. */
export function PhotosSection({
  photos,
  setPhoto,
  error,
}: {
  photos: Partial<Record<PhotoSlot, File>>;
  setPhoto: (slot: PhotoSlot, file: File | undefined) => void;
  error?: string;
}) {
  return (
    <fieldset className="va-add__product">
      <legend>Photos</legend>
      <p className="small muted">
        JPEG, PNG or WebP, up to 10 MiB each. Photos stay private until the
        product is published.
      </p>
      <PhotoPicker
        slot="front"
        label="Front of pack photo"
        required
        file={photos.front}
        onChange={(file) => setPhoto("front", file)}
        error={error}
      />
      <PhotoPicker
        slot="ingredients"
        file={photos.ingredients}
        onChange={(file) => setPhoto("ingredients", file)}
      />
      <PhotoPicker
        slot="back"
        file={photos.back}
        onChange={(file) => setPhoto("back", file)}
      />
      <PhotoPicker
        slot="nutrition"
        label="Nutrition and allergens photo"
        file={photos.nutrition}
        onChange={(file) => setPhoto("nutrition", file)}
      />
    </fieldset>
  );
}
