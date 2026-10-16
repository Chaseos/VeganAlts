// Blur and glare scores for choosing between shots of the same label.
// Scores only compare shots of the same face of the same product.

export interface Grey {
  data: Uint8Array;
  width: number;
  height: number;
}

function tiles(
  { width, height }: Grey,
  columns: number,
  rows: number,
  measure: (index: number) => number | null,
) {
  const sums = Array<number>(columns * rows).fill(0);
  const squares = Array<number>(columns * rows).fill(0);
  const counts = Array<number>(columns * rows).fill(0);
  for (let y = 1; y < height - 1; y++) {
    const row = Math.min(rows - 1, Math.floor((y * rows) / height));
    for (let x = 1; x < width - 1; x++) {
      const value = measure(y * width + x);
      if (value === null) continue;
      const tile =
        row * columns +
        Math.min(columns - 1, Math.floor((x * columns) / width));
      sums[tile] = sums[tile]! + value;
      squares[tile] = squares[tile]! + value * value;
      counts[tile] = counts[tile]! + 1;
    }
  }
  return { sums, squares, counts };
}

/** The standard deviation of the 4-neighbour Laplacian in each tile. */
export function tileSharpness(grey: Grey, columns: number, rows: number) {
  const { data, width } = grey;
  const { sums, squares, counts } = tiles(
    grey,
    columns,
    rows,
    (i) =>
      data[i - 1]! +
      data[i + 1]! +
      data[i - width]! +
      data[i + width]! -
      4 * data[i]!,
  );
  return sums.map((sum, tile) => {
    const count = counts[tile]!;
    if (!count) return 0;
    const mean = sum / count;
    return Math.sqrt(Math.max(0, squares[tile]! / count - mean * mean));
  });
}

/** The share of near-white pixels (250 and up) in each tile. */
export function tileGlare(grey: Grey, columns: number, rows: number) {
  const { sums, counts } = tiles(grey, columns, rows, (i) =>
    grey.data[i]! >= 250 ? 1 : 0,
  );
  return sums.map((sum, tile) => (counts[tile] ? sum / counts[tile]! : 0));
}

export function percentile(values: readonly number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (rank - low);
}

const round = (value: number, places: number) =>
  Math.round(value * 10 ** places) / 10 ** places;

/**
 * A photo's sharpness is its 90th-percentile tile, so a label that fills only
 * part of the frame still scores fairly; glare is averaged over the sharpest
 * quarter of tiles, where the label usually is.
 */
export function photoScores(grey: Grey) {
  const [columns, rows] = grey.height >= grey.width ? [4, 6] : [6, 4];
  const sharpness = tileSharpness(grey, columns, rows);
  const glare = tileGlare(grey, columns, rows);
  const sharpest = sharpness
    .map((score, tile) => ({ score, glare: glare[tile]! }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.round(sharpness.length / 4)));
  return {
    sharpness: round(percentile(sharpness, 90), 1),
    glare: round(
      sharpest.reduce((sum, tile) => sum + tile.glare, 0) / sharpest.length,
      3,
    ),
  };
}

/** Ranks shots of one label: glare washes out text, so it costs score. */
export const pickScore = (photo: { sharpness: number; glare: number }) =>
  photo.sharpness * (1 - Math.min(0.6, photo.glare * 4));
