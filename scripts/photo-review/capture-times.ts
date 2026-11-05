import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Capture times for photos whose file names carry none (an iPhone's
// IMG_1133.HEIC, unlike a Pixel's PXL_20261014_…). photos:prepare reads them
// from the original's EXIF, because the WebP copies carry no metadata, and
// keeps them beside the copies.

export const CAPTURE_TIMES_FILE = "capture-times.json";

const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME = 0x0132;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_SUB_SEC_TIME_ORIGINAL = 0x9291;

/**
 * DateTimeOriginal from an EXIF block (as sharp's metadata().exif returns
 * it), in UTC when the camera recorded its time-zone offset and in this
 * machine's zone otherwise. Null when the block has no readable time.
 */
export function exifCaptureTime(exif: Buffer): Date | null {
  try {
    const base = exif.toString("latin1", 0, 6) === "Exif\0\0" ? 6 : 0;
    const order = exif.toString("latin1", base, base + 2);
    if (order !== "II" && order !== "MM") return null;
    const little = order === "II";
    const u16 = (at: number) =>
      little ? exif.readUInt16LE(base + at) : exif.readUInt16BE(base + at);
    const u32 = (at: number) =>
      little ? exif.readUInt32LE(base + at) : exif.readUInt32BE(base + at);
    const directory = (offset: number) => {
      const tags = new Map<number, { count: number; at: number }>();
      const count = u16(offset);
      for (let index = 0; index < count; index++) {
        const at = offset + 2 + index * 12;
        const valueCount = u32(at + 4);
        // Values of four bytes or fewer sit inside the entry itself.
        tags.set(u16(at), {
          count: valueCount,
          at: valueCount <= 4 ? at + 8 : u32(at + 8),
        });
      }
      return tags;
    };
    const ascii = (
      tags: ReadonlyMap<number, { count: number; at: number }>,
      tag: number,
    ) => {
      const entry = tags.get(tag);
      if (!entry) return undefined;
      return exif
        .toString("latin1", base + entry.at, base + entry.at + entry.count)
        .replace(/\0+$/, "")
        .trim();
    };
    const first = directory(u32(4));
    const exifIfd = first.get(TAG_EXIF_IFD);
    const details = exifIfd ? directory(u32(exifIfd.at)) : new Map();
    const stamp =
      ascii(details, TAG_DATE_TIME_ORIGINAL) ?? ascii(first, TAG_DATE_TIME);
    const parts = stamp?.match(
      /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/,
    );
    if (!parts) return null;
    const subSeconds = (ascii(details, TAG_SUB_SEC_TIME_ORIGINAL) ?? "")
      .replace(/\D/g, "")
      .padEnd(3, "0")
      .slice(0, 3);
    const offset = ascii(details, TAG_OFFSET_TIME_ORIGINAL);
    const iso = `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}.${subSeconds || "000"}${offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : ""}`;
    const time = new Date(iso);
    return Number.isNaN(time.getTime()) ? null : time;
  } catch {
    return null;
  }
}

/** The capture times photos:prepare saved for this folder's WebP copies. */
export async function readCaptureTimes(web: string) {
  try {
    const saved = JSON.parse(
      await readFile(join(web, CAPTURE_TIMES_FILE), "utf8"),
    ) as Record<string, string>;
    return new Map(
      Object.entries(saved).map(([name, time]) => [name, new Date(time)]),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
}
