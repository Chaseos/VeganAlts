import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { type Batch, photoFile } from "./batch";

// Contact sheets: thumbnails at their own 375×500 size with a caption bar,
// so an agent reads a dozen photos from one image.

const TILE = { width: 375, height: 500 };
const CAPTION = 30;

export interface Tile {
  photo?: string;
  // A thumbnail outside this batch (an earlier batch's photo), by path.
  path?: string;
  caption: string;
  // Context photos are shown for reference only.
  muted?: boolean;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

const caption = (tile: Tile) =>
  Buffer.from(
    `<svg width="${TILE.width}" height="${CAPTION}"><rect width="100%" height="100%" fill="${tile.muted ? "#5a1d1d" : "#222"}"/><text x="6" y="21" font-family="Helvetica" font-size="15" fill="#fff">${escape(tile.caption)}</text></svg>`,
  );

export async function sheet(
  batch: Batch,
  tiles: readonly Tile[],
  columns: number,
  output: string,
) {
  const rows = Math.ceil(tiles.length / columns);
  const layers = await Promise.all(
    tiles.map(async (tile, index) => {
      const left = (index % columns) * TILE.width;
      const top = Math.floor(index / columns) * (TILE.height + CAPTION);
      const parts: OverlayOptions[] = [{ input: caption(tile), left, top }];
      if (tile.photo || tile.path)
        parts.push({
          input: await sharp(
            tile.path ?? photoFile(batch, tile.photo!, "thumbnail"),
          )
            .resize(TILE.width, TILE.height, {
              fit: "contain",
              background: "#000",
            })
            .png()
            .toBuffer(),
          left,
          top: top + CAPTION,
        });
      return parts;
    }),
  );
  await mkdir(dirname(output), { recursive: true });
  await sharp({
    create: {
      width: columns * TILE.width,
      height: rows * (TILE.height + CAPTION),
      channels: 3,
      background: "#111",
    },
  })
    .composite(layers.flat())
    .jpeg({ quality: 82 })
    .toFile(output);
}
