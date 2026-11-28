import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths } from "./layout.js";
import { isMissingDirectory, readToolNameResolution } from "./tool-name-validation.js";

/** Names of the project's tool files whose name can be read statically, sorted. */
export async function readToolFileNames(root: string): Promise<string[]> {
  const paths = getProjectPaths(root);
  let entries: string[];
  try {
    entries = (await readdir(paths.directories.tools, { withFileTypes: true }))
      .filter((entry) => !entry.isDirectory() && entry.name.endsWith(".tool.ts"))
      .map((entry) => entry.name);
  } catch (error) {
    if (isMissingDirectory(error)) return [];
    throw error;
  }
  const names: string[] = [];
  for (const entry of entries) {
    const text = await readFile(join(paths.directories.tools, entry), "utf8");
    const resolution = await readToolNameResolution(text, entry);
    if (resolution?.kind === "known") names.push(resolution.name);
  }
  return names.sort();
}
