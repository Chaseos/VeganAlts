import { FoodIcon } from "../icons/food-icons";
import { useEffect, useRef, useState } from "react";

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
  const [failed, setFailed] = useState<string | null>(null);
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A server-rendered image may fail before hydration installs onError.
    if (image.current?.complete && image.current.naturalWidth === 0)
      setFailed(imageId);
  }, [imageId]);
  const className = `va-thumb va-thumb--${size}`;
  return imageId && failed !== imageId ? (
    <img
      ref={image}
      className={className}
      src={`/media/${imageId}/thumbnail`}
      alt=""
      width={pixels}
      height={pixels}
      loading="lazy"
      onError={() => setFailed(imageId)}
    />
  ) : (
    <span className={`${className} va-thumb--empty`} aria-hidden="true">
      <FoodIcon slug={food} size={Math.round(pixels / 2.4)} />
    </span>
  );
}
