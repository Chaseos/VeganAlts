import { readdir } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  type Batch,
  moveAside,
  photoFile,
  readJson,
  readJsonIfPresent,
  result,
  runFile,
  savedIds,
  writeJson,
} from "./batch";
import { readCaptureTimes } from "./capture-times";
import { pendingMoves } from "./move-log";
import { chunkPlan, type PhotoEntry, photoIndex } from "./schema";
import { photoScores } from "./sharpness";
import { sheet } from "./sheets";
import { captureTime, cutRanges, timeline } from "./timeline";

// `index`, `chunks` and `range`: the photo list every later step works from.

export async function folderPhotos(batch: Batch) {
  return (await readdir(join(batch.web, "full")))
    .filter((name) => name.toLowerCase().endsWith(".webp"))
    .sort();
}

export const loadIndex = (batch: Batch) =>
  readJson(runFile(batch, "photos.json"), photoIndex);
export const loadChunks = (batch: Batch) =>
  readJson(runFile(batch, "chunks.json"), chunkPlan);

export const clock = (entry: PhotoEntry) =>
  entry.time?.slice(11, 19) ?? "--:--:--";
export const number = (entry: PhotoEntry) =>
  `#${String(entry.n).padStart(4, "0")}`;
export const describe = (entry: PhotoEntry) =>
  `${number(entry)} ${entry.name} ${entry.width}×${entry.height} ${clock(entry)} visit ${entry.visit} sharp ${entry.sharpness} glare ${Math.round(entry.glare * 100)}%`;

/** Numbers every photo in the folder; scores only the selected ones. */
export async function indexPhotos(
  batch: Batch,
  selection: Set<number> | undefined,
  force: boolean,
) {
  // Photo numbers come from the folder listing, so moved photos (a pilot's
  // out-of-scope or set-aside moves) would shift every number, and a new
  // index renumbers whatever was chunked and sorted against the old one.
  const moves = await pendingMoves(batch);
  if (moves.length && !force)
    throw new Error(
      `${moves.length} photo files have been moved out of full/ and thumbnail/. Undo those moves first (out-of-scope --undo, set-aside --undo), or pass --force to index without them.`,
    );
  if (
    (await readJsonIfPresent(runFile(batch, "photos.json"), photoIndex)) &&
    !force
  )
    throw new Error(
      "This run is already indexed. Pass --force to index again; the old index, ranges and sorting move to <run>/old.",
    );
  for (const name of ["photos.json", "chunks.json", "sort", "sheets"])
    await moveAside(batch, name);
  const [names, times] = await Promise.all([
    folderPhotos(batch),
    readCaptureTimes(batch.web),
  ]);
  // iPhone names (IMG_1352) don't always sort in capture order; when every
  // photo has a time, photos are numbered in capture order instead.
  const timeOf = (name: string) =>
    (captureTime(name) ?? times.get(name))?.getTime();
  const ordered = names.every((name) => timeOf(name) !== undefined)
    ? [...names].sort((a, b) => timeOf(a)! - timeOf(b)! || a.localeCompare(b))
    : names;
  const entries = timeline(ordered, times).filter(
    (entry) => !selection || selection.has(entry.n),
  );
  if (!entries.length) throw new Error("No photos match that selection.");
  sharp.cache(false);
  sharp.concurrency(1);
  const scored: PhotoEntry[] = [];
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.max(1, availableParallelism() - 2) },
      async () => {
        while (next < entries.length) {
          const index = next++;
          const entry = entries[index]!;
          const { data, info } = await sharp(photoFile(batch, entry.name))
            .greyscale()
            .raw()
            .toBuffer({ resolveWithObject: true });
          if (info.channels !== 1)
            throw new Error(`${entry.name}: expected one grey channel.`);
          if ((index + 1) % 100 === 0)
            console.log(`  scored ${index + 1} of ${entries.length}`);
          scored[index] = {
            ...entry,
            ...photoScores({ data, width: info.width, height: info.height }),
            width: info.width,
            height: info.height,
          };
        }
      },
    ),
  );
  await writeJson(runFile(batch, "photos.json"), { photos: scored });
  const visits = [...new Set(scored.map((entry) => entry.visit))];
  console.log(
    `Indexed ${scored.length} photos in ${visits.length} visits (${runFile(batch, "photos.json")}).`,
  );
  result({ ok: true, photos: scored.length, visits: visits.length });
}

const PER_SHEET = 12;

/** Ranges for the sort agents, each with the 8 photos before it as context. */
export async function planChunks(batch: Batch, size: number, force: boolean) {
  // New ranges would not match the sort results already saved.
  if ((await savedIds(batch, "sort")).length && !force)
    throw new Error(
      "Ranges have already been sorted. Re-chunking sets that work aside; pass --force only if that is intended.",
    );
  await moveAside(batch, "sort");
  const { photos } = await loadIndex(batch);
  const ranges = [];
  for (const [index, members] of cutRanges(photos, size).entries()) {
    const id = `range-${String(index + 1).padStart(2, "0")}`;
    const first = members[0]!;
    const context = photos.filter(
      (entry) => entry.n >= first.n - 8 && entry.n < first.n,
    );
    const tiles = [
      ...context.map((entry) => ({
        photo: entry.name,
        caption: `context ${number(entry)} ${clock(entry)}`,
        muted: true,
      })),
      ...members.map((entry) => ({
        photo: entry.name,
        caption: `${number(entry)} ${clock(entry)} · sharp ${Math.round(entry.sharpness)} · glare ${Math.round(entry.glare * 100)}%`,
      })),
    ];
    const sheets: string[] = [];
    for (let start = 0; start < tiles.length; start += PER_SHEET) {
      const path = runFile(
        batch,
        "sheets",
        `${id}-${String(start / PER_SHEET + 1).padStart(2, "0")}.jpg`,
      );
      await sheet(batch, tiles.slice(start, start + PER_SHEET), 4, path);
      sheets.push(path);
    }
    ranges.push({
      id,
      photos: members.map((entry) => entry.name),
      context: context.map((entry) => entry.name),
      sheets,
    });
    console.log(
      `${id}: ${number(first)}–${number(members.at(-1)!)} (${members.length} photos, ${context.length} context, ${sheets.length} sheets)`,
    );
  }
  await writeJson(runFile(batch, "chunks.json"), { ranges });
  result({ ok: true, ranges: ranges.map((range) => range.id) });
}

/** What a sort agent needs about its range. */
export async function describeRange(batch: Batch, id: string) {
  const [{ photos }, plan] = await Promise.all([
    loadIndex(batch),
    loadChunks(batch),
  ]);
  const range = plan.ranges.find((entry) => entry.id === id);
  if (!range) throw new Error(`No range ${id}.`);
  const byName = new Map(photos.map((entry) => [entry.name, entry]));
  console.log(`Range ${id}: ${range.photos.length} photos.`);
  console.log(`Thumbnails: ${join(batch.web, "thumbnail")}`);
  console.log(`Full photos: ${join(batch.web, "full")}`);
  console.log("Context (before the range; read-only, never assign these):");
  for (const name of range.context)
    console.log(`  ${describe(byName.get(name)!)}`);
  console.log("Photos to assign:");
  for (const name of range.photos)
    console.log(`  ${describe(byName.get(name)!)}`);
  console.log("Contact sheets, in order:");
  for (const path of range.sheets) console.log(`  ${path}`);
}
