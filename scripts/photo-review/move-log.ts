import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Batch } from "./batch";

// The move logs of `<web>/set-aside` and `<web>/out-of-scope`, read by the
// moves themselves, by index (which refuses to renumber around moved photos)
// and by render (which links moved photos where they are now).

export const FOLDERS = {
  setAside: "set-aside",
  outOfScope: "out-of-scope",
} as const;

export interface Move {
  photo: string;
  product?: string;
  reason: string;
  from: string;
  to: string;
}

export const logFile = (batch: Batch, folder: string) =>
  join(batch.web, folder, "moves.jsonl");
export const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export async function readLog(path: string): Promise<Move[]> {
  try {
    return (await readFile(path, "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Move);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** A folder name for a suggested food, e.g. "Instant noodles". */
export const folderName = (value: string) =>
  value
    .replace(/[^\p{L}\p{N} &'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60) || "Other";

/** Logged moves not yet undone, across both folders. */
export async function pendingMoves(batch: Batch) {
  return (
    await Promise.all(
      Object.values(FOLDERS).map((folder) => readLog(logFile(batch, folder))),
    )
  ).flat();
}

/** Where moved photos are now, relative to `<web>`: photo → "set-aside". */
export async function movedPhotos(batch: Batch) {
  const moved = new Map<string, string>();
  for (const move of await pendingMoves(batch))
    if (move.to.includes("/thumbnail/") && (await exists(move.to)))
      moved.set(
        move.photo,
        move.to.slice(batch.web.length + 1).replace(/\/thumbnail\/[^/]+$/, ""),
      );
  return moved;
}
