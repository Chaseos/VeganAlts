import { appendFile, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Batch } from "./batch";
import {
  exists,
  FOLDERS,
  folderName,
  logFile,
  type Move,
  movedPhotos,
  readLog,
} from "./move-log";
import { loadRun, productPhotos } from "./view";

// Photo moves out of `<web>/full` and `<web>/thumbnail`, never deletions:
// `set-aside` (after the owner approves the review) and `out-of-scope` (lines
// no site food fits, into a folder per suggested food for the owner's own
// review). Each move is logged before it happens; --undo reverses the log,
// for one product or for everything, and keeps whatever it could not undo.

const SIZES = ["full", "thumbnail"] as const;

async function apply(
  batch: Batch,
  folder: string,
  entries: {
    photo: string;
    product?: string;
    reason: string;
    subfolder?: string;
  }[],
) {
  let moved = 0;
  const missing: string[] = [];
  for (const entry of entries)
    for (const size of SIZES) {
      const target = join(batch.web, folder, entry.subfolder ?? "", size);
      const move: Move = {
        photo: entry.photo,
        product: entry.product,
        reason: entry.reason,
        from: join(batch.web, size, entry.photo),
        to: join(target, entry.photo),
      };
      if (!(await exists(move.from))) {
        if (size === "full") missing.push(entry.photo);
        continue;
      }
      await mkdir(target, { recursive: true });
      // Logged first, so a crash mid-move can still be undone.
      await appendFile(logFile(batch, folder), `${JSON.stringify(move)}\n`);
      await rename(move.from, move.to);
      moved += 1;
    }
  if (missing.length) {
    const elsewhere = await movedPhotos(batch);
    console.log(
      `Skipped ${missing.length} photos no longer in full/: ${missing
        .map(
          (photo) =>
            `${photo}${elsewhere.has(photo) ? ` (in ${elsewhere.get(photo)})` : ""}`,
        )
        .join(", ")}`,
    );
  }
  console.log(
    `Moved ${moved} files into ${join(batch.web, folder)}. Undo with --undo.`,
  );
}

/** Reverses logged moves (all, or one product's) and keeps the rest logged. */
async function undo(batch: Batch, folder: string, product?: string) {
  const log = logFile(batch, folder);
  const moves = await readLog(log);
  const chosen = moves.filter((move) => !product || move.product === product);
  if (!chosen.length) return console.log("Nothing to undo.");
  const kept = moves.filter((move) => !chosen.includes(move));
  let restored = 0;
  const failed: string[] = [];
  for (const move of [...chosen].reverse()) {
    const [there, back] = await Promise.all([
      exists(move.to),
      exists(move.from),
    ]);
    if (!there && back) continue; // Already restored.
    if (!there || back) {
      failed.push(
        `${move.photo}: ${back ? "a file is already back in place" : "missing from the moved folder"}`,
      );
      kept.push(move);
      continue;
    }
    await rename(move.to, move.from);
    restored += 1;
  }
  if (!kept.length && !product)
    await rename(
      log,
      join(batch.web, folder, `moves-undone-${Date.now()}.jsonl`),
    );
  else
    await writeFile(
      log,
      kept.map((move) => JSON.stringify(move)).join("\n") +
        (kept.length ? "\n" : ""),
    );
  console.log(`Moved ${restored} files back.`);
  if (failed.length)
    console.log(`Not undone (still logged):\n  ${failed.join("\n  ")}`);
}

export async function setAside(
  batch: Batch,
  mode: "list" | "apply" | "undo",
  product?: string,
) {
  if (mode === "undo") return undo(batch, FOLDERS.setAside, product);
  const { setAside: entries } = await loadRun(batch);
  const byReason = new Map<string, number>();
  for (const entry of entries)
    byReason.set(entry.reason, (byReason.get(entry.reason) ?? 0) + 1);
  console.log(
    `${entries.length} photos to set aside: ${[...byReason].map(([reason, count]) => `${count} ${reason}`).join(", ") || "none"}.`,
  );
  if (mode === "list") {
    for (const entry of entries)
      console.log(
        `  ${entry.photo} — ${entry.reason}${entry.duplicateOf ? ` (kept ${entry.duplicateOf})` : ""}`,
      );
    return console.log(
      "Nothing moved. Run with --apply after the owner approves.",
    );
  }
  await apply(batch, FOLDERS.setAside, entries);
}

export async function outOfScope(
  batch: Batch,
  mode: "list" | "apply" | "undo",
  product?: string,
) {
  if (mode === "undo") return undo(batch, FOLDERS.outOfScope, product);
  const { views } = await loadRun(batch);
  const out = views.filter((view) => view.outOfScope && !view.skip);
  const entries = out.flatMap((view) =>
    productPhotos(view.record).map((photo) => ({
      photo,
      product: view.id,
      reason: `out of scope: ${view.outOfScope}`,
      subfolder: folderName(view.outOfScope!),
    })),
  );
  const byFood = new Map<string, number>();
  for (const view of out)
    byFood.set(view.outOfScope!, (byFood.get(view.outOfScope!) ?? 0) + 1);
  console.log(
    `${out.length} out-of-scope products (${entries.length} photos): ${[...byFood].map(([food, count]) => `${food} ${count}`).join(", ") || "none"}.`,
  );
  if (mode === "list") {
    for (const view of out)
      console.log(
        `  ${view.outOfScope}: ${view.brand} · ${view.name} (${view.id})`,
      );
    return console.log("Nothing moved. Run with --apply to move them.");
  }
  await apply(batch, FOLDERS.outOfScope, entries);
}
