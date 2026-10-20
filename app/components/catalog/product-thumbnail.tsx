import { FoodIcon } from "../icons/food-icons";

/** Public lists use the accepted main photo's lightweight thumbnail variant. */
export function ProductThumbnail({
  imageId,
  food,
  size = "list",
}: {
  imageId: string | null;
  food: string;
  size?: "small" | "list" | "featured";
}) {
  const pixels = { small: 56, list: 128, featured: 200 }[size];
  const className = `va-thumb va-thumb--${size}`;
  return imageId ? (
    <img
      className={className}
      src={`/media/${imageId}/thumbnail`}
      alt=""
      width={pixels}
      height={pixels}
      loading="lazy"
    />
  ) : (
    <span className={`${className} va-thumb--empty`} aria-hidden="true">
      <FoodIcon slug={food} size={Math.round(pixels / 2.4)} />
    </span>
  );
}
