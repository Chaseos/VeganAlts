import { PhotoPicker } from "../community-form";
import type { PhotoSlot } from "../../lib/product-draft";
import { t } from "../../i18n";

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
      <legend>{t("contribute.tabPhotos")}</legend>
      <p className="small muted">{t("addProduct.photoRules")}</p>
      <PhotoPicker
        slot="front"
        label={t("addProduct.frontOfPack")}
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
        label={t("contribute.nutritionAllergensPhoto")}
        file={photos.nutrition}
        onChange={(file) => setPhoto("nutrition", file)}
      />
    </fieldset>
  );
}
