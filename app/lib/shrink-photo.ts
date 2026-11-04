import { derivativeSpecs } from "@server/media/domain/media";

// The largest copy the server keeps, so a bigger upload only costs time.
const MAX_EDGE = Math.max(
  ...derivativeSpecs("ingredients").map((spec) => spec.maxEdge),
);
const QUALITY = 0.9;

async function shrunk(file: File) {
  const url = URL.createObjectURL(file);
  try {
    // An <img> applies the photo's rotation in every browser.
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d")!;
    // JPEG has no transparency, and a transparent PNG would turn black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) return file;
    const name = `${file.name.replace(/\.[^.]*$/, "")}.jpg`;
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // A phone short of memory uploads the original; the server still resizes.
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// A retry must send the same bytes: the server refuses a retried upload whose
// content differs, and encoding isn't guaranteed to repeat exactly.
const results = new WeakMap<File, Promise<File>>();

/**
 * A photo sized for upload, redrawn so it carries no location or camera data.
 * The original is never lost: any failure here uploads it unchanged.
 */
export function shrinkPhoto(file: File) {
  const known = results.get(file);
  if (known) return known;
  const result = shrunk(file);
  results.set(file, result);
  return result;
}
