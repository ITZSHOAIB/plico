import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjectPaths } from "@plico/core";

async function toolFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" ? [] : toolFiles(path);
      return entry.name.endsWith(".ts") ? [path] : [];
    }),
  );
  return files.flat().sort();
}

/** Hashes every TypeScript file under `tools/`, tool files and the helpers they import. */
export async function fingerprintTools(root: string): Promise<string> {
  const directory = getProjectPaths(root).directories.tools;
  const hash = createHash("sha256");
  for (const file of await toolFiles(directory)) {
    hash.update(file.slice(directory.length).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}
