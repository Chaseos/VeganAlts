import sharp from "sharp";
import { expect, test } from "./fixtures";
import { createBrowserSession } from "./session-fixture";

// A 12-megapixel phone photo, stored sideways with a rotation tag and a GPS
// position. Stored left half red, so it reads red at the top once upright.
async function phonePhoto() {
  const half = await sharp({
    create: { width: 2000, height: 3000, channels: 3, background: "#d00000" },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 4000, height: 3000, channels: 3, background: "#0000d0" },
  })
    .composite([{ input: half, left: 0, top: 0 }])
    .withExif({
      IFD0: { Make: "Google" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "39/1 44/1 0/1" },
    })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 95 })
    .toBuffer();
}

// The tags in an EXIF block's first directory, which points to its GPS data.
const GPS_TAG = 0x8825,
  MAKE_TAG = 0x010f;
function exifTags(exif: Buffer | undefined) {
  if (!exif) return [];
  const start = exif.indexOf("Exif\0\0") + 6;
  const little = exif.toString("latin1", start, start + 2) === "II";
  const u16 = (at: number) =>
    little ? exif.readUInt16LE(at) : exif.readUInt16BE(at);
  const u32 = (at: number) =>
    little ? exif.readUInt32LE(at) : exif.readUInt32BE(at);
  const first = start + u32(start + 4);
  return Array.from({ length: u16(first) }, (_, entry) =>
    u16(first + 2 + entry * 12),
  );
}

test("shrinks a phone photo before upload, upright and without its location", async ({
  page,
  context,
}) => {
  test.skip(
    Boolean(process.env.TEST_BASE_URL),
    "Real staging accounts are verified interactively.",
  );
  const session = await createBrowserSession();
  try {
    await context.addCookies([session.cookie]);
    // Keeps what would upload, without storing a test photo.
    await page.addInitScript(() => {
      const send = window.fetch;
      window.fetch = async (input, init) => {
        const image =
          init?.body instanceof FormData ? init.body.get("image") : null;
        if (!(image instanceof File)) return send(input, init);
        const bytes = new Uint8Array(await image.arrayBuffer());
        (window as unknown as { sent: unknown }).sent = {
          name: image.name,
          type: image.type,
          bytes: btoa(
            Array.from(bytes, (b) => String.fromCharCode(b)).join(""),
          ),
        };
        return Response.json(
          { title: "Stopped by the test." },
          { status: 400 },
        );
      };
    });
    await page.goto("/us/en/products/beyond-burger");
    await page.getByText("Add or improve photos", { exact: true }).click();
    await page
      .getByRole("link", { name: /^(Add photo|Suggest a better photo): Back$/ })
      .click();
    await expect(page.getByLabel("Photo", { exact: true })).toBeEnabled();
    const original = await phonePhoto();
    const before = await sharp(original).metadata();
    expect(before.orientation).toBe(6);
    expect(exifTags(before.exif)).toEqual(
      expect.arrayContaining([GPS_TAG, MAKE_TAG]),
    );
    await page.getByLabel(/Back photo/).setInputFiles({
      name: "PXL_phone.jpg",
      mimeType: "image/jpeg",
      buffer: original,
    });
    await page.getByRole("button", { name: "Submit photo" }).click();
    await page.waitForFunction(() => "sent" in window);
    const sent = await page.evaluate(
      () =>
        (
          window as unknown as {
            sent: { name: string; type: string; bytes: string };
          }
        ).sent,
    );
    expect(sent).toMatchObject({ name: "PXL_phone.jpg", type: "image/jpeg" });
    const bytes = Buffer.from(sent.bytes, "base64");
    const meta = await sharp(bytes).metadata();
    // Upright, at the largest size the server keeps.
    expect([meta.width, meta.height]).toEqual([1800, 2400]);
    expect(meta.orientation ?? 1).toBe(1);
    const { data } = await sharp(bytes)
      .extract({ left: 900, top: 100, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[0]!).toBeGreaterThan(150);
    expect(data[2]!).toBeLessThan(100);
    // No location or camera data leaves the device. WebKit writes its own
    // small block, so this reads the tags rather than expecting none.
    const left = exifTags(meta.exif);
    expect(left).not.toContain(GPS_TAG);
    expect(left).not.toContain(MAKE_TAG);
  } finally {
    await session.dispose();
  }
});
