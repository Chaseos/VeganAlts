import type { ImageSlot } from "@server/media/domain/media";

/** A stored photo turned a quarter turn, ready to upload as its replacement. */
export async function rotatedPhoto(
  url: string,
  slot: ImageSlot,
  direction: "left" | "right",
) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The photo couldn’t be loaded.");
  const image = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  canvas.width = image.height;
  canvas.height = image.width;
  const context = canvas.getContext("2d")!;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(((direction === "right" ? 1 : -1) * Math.PI) / 2);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.95),
  );
  if (!blob) throw new Error("The photo couldn’t be rotated.");
  return new File([blob], `${slot}-rotated.jpg`, { type: "image/jpeg" });
}

/** Sets a formula's photo for a slot, archiving the one it replaces. */
export async function uploadProductPhoto(
  versionId: string,
  slot: ImageSlot,
  file: File,
) {
  const form = new FormData();
  form.set("productVersionId", versionId);
  form.set("slot", slot);
  form.set("idempotencyKey", crypto.randomUUID());
  form.set("image", file);
  const response = await fetch("/api/v1/media/uploads", {
    method: "POST",
    body: form,
  });
  const value = (await response.json().catch(() => null)) as {
    imageId?: string;
    title?: string;
  } | null;
  if (!response.ok || !value?.imageId)
    throw new Error(value?.title ?? "The photo couldn’t be saved.");
  return value.imageId;
}
