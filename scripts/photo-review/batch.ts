import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { z } from "zod";
import { productRecord } from "./schema";

// Where a photo batch lives: the converted photos (`<web>/full`,
// `<web>/thumbnail`) and one run folder of review files (`<web>/review`, or
// `<web>/review-pilot` for a pilot).

export interface Batch {
  web: string;
  run: string;
}

export function openBatch(target: string, runName = "review"): Batch {
  const web = resolve(target);
  // Visual captures never belong in the repository (AGENTS.md).
  if (web === process.cwd() || web.startsWith(process.cwd() + sep))
    throw new Error("Keep photo batches outside the repository.");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(runName))
    throw new Error(`Use a run name like "review-pilot", not "${runName}".`);
  return { web, run: join(web, runName) };
}

export const photoFile = (
  batch: Batch,
  name: string,
  size: "full" | "thumbnail" = "full",
) => join(batch.web, size, name);
export const runFile = (batch: Batch, ...parts: string[]) =>
  join(batch.run, ...parts);
export const stem = (name: string) => name.replace(/\.webp$/i, "");

export async function readJson<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<z.output<S>> {
  const parsed = schema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success)
    throw new Error(`${path}:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export async function readJsonIfPresent<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<z.output<S> | undefined> {
  try {
    return await readJson(path, schema);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Writes through a temporary file, so readers never see half a file. */
export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + "\n");
  await rename(temporary, path);
}

/** The ids (file names without .json) saved in a run subfolder. */
export async function savedIds(batch: Batch, folder: string) {
  try {
    return (await readdir(runFile(batch, folder)))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** The machine-readable last line runner agents return. */
export function result(value: Record<string, unknown>) {
  console.log(`RESULT ${JSON.stringify(value)}`);
}

export const loadProduct = (batch: Batch, id: string) =>
  readJson(runFile(batch, "products", `${id}.json`), productRecord);

/**
 * Moves a run file or folder into `<run>/old/<name>-<time>` instead of
 * deleting it, so a rerun never destroys earlier work. Returns the new path.
 */
export async function moveAside(batch: Batch, name: string) {
  const from = runFile(batch, name);
  try {
    await access(from);
  } catch {
    return undefined;
  }
  const to = runFile(batch, "old", `${name.replace(/\//g, "-")}-${Date.now()}`);
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
  return to;
}
