// Capture times, store visits and photo ranges for the photo-batch skill.

const PIXEL_NAME = /^PXL_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})(\d{3})/;

/** A Pixel photo's capture time (its file name is UTC), or null. */
export function captureTime(name: string): Date | null {
  const match = PIXEL_NAME.exec(name);
  if (!match) return null;
  const [
    year = 0,
    month = 1,
    day = 1,
    hour = 0,
    minute = 0,
    second = 0,
    ms = 0,
  ] = match.slice(1).map(Number);
  const time = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, ms),
  );
  return Number.isNaN(time.getTime()) ? null : time;
}

/** A pause this long between photos starts a new store visit. */
export const VISIT_GAP_SECONDS = 8 * 60;

export interface TimelineEntry {
  n: number;
  name: string;
  time: string | null;
  gap: number | null;
  visit: number;
}

/**
 * Numbers photos in capture order (their sorted file names) and splits them
 * into visits. A name without a time (an iPhone's IMG_1133) uses `times`,
 * saved by photos:prepare. Photos without a readable time stay in the
 * current visit.
 */
export function timeline(
  names: readonly string[],
  times: ReadonlyMap<string, Date> = new Map(),
): TimelineEntry[] {
  let visit = 0;
  let previous: Date | null = null;
  return names.map((name, index) => {
    const time = captureTime(name) ?? times.get(name) ?? null;
    const gap =
      time && previous ? (time.getTime() - previous.getTime()) / 1000 : null;
    if (index === 0 || (gap !== null && gap >= VISIT_GAP_SECONDS)) visit += 1;
    if (time) previous = time;
    return {
      n: index + 1,
      name,
      time: time?.toISOString() ?? null,
      gap,
      visit,
    };
  });
}

/** Photo numbers from a list like "301-400,1101-1200". */
export function photoNumbers(spec: string): Set<number> {
  const numbers = new Set<number>();
  for (const part of spec.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    const first = Number(match?.[1]);
    const last = Number(match?.[2] ?? match?.[1]);
    if (!match || first < 1 || last < first)
      throw new Error(
        `Use photo numbers like 301-400,1101-1200, not "${part}".`,
      );
    for (let n = first; n <= last; n++) numbers.add(n);
  }
  return numbers;
}

/**
 * Splits photos into ranges of about `size` without crossing a break in the
 * numbering. Each cut moves to the longest pause within `slack` photos of
 * where it would fall, so ranges tend to end between products and visits.
 */
export function cutRanges<T extends { n: number; gap: number | null }>(
  photos: readonly T[],
  size: number,
  slack = 15,
): T[][] {
  const blocks: T[][] = [];
  for (const photo of photos) {
    const block = blocks.at(-1);
    if (block && block.at(-1)!.n + 1 === photo.n) block.push(photo);
    else blocks.push([photo]);
  }
  return blocks.flatMap((block) => {
    const count = Math.max(1, Math.round(block.length / size));
    const starts = [0];
    for (let index = 1; index < count; index++) {
      const nominal = Math.round((index * block.length) / count);
      const from = Math.max(starts.at(-1)! + 1, nominal - slack);
      const to = Math.min(block.length - 1, nominal + slack);
      let best = -1;
      for (let j = from; j <= to; j++) {
        const gap = block[j]!.gap ?? 0;
        const bestGap = best < 0 ? -Infinity : (block[best]!.gap ?? 0);
        if (
          gap > bestGap ||
          (gap === bestGap && Math.abs(j - nominal) < Math.abs(best - nominal))
        )
          best = j;
      }
      if (best > 0) starts.push(best);
    }
    return starts.map((start, index) =>
      block.slice(start, starts[index + 1] ?? block.length),
    );
  });
}
