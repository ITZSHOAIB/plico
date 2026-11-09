import { readdir } from "node:fs/promises";
import { getProjectPaths, getProjectRelativePaths } from "./layout.js";
import type { ValidationIssue } from "./types.js";

const CASE_SUFFIX = ".script.json";

/** Warns about files in `evals/` that `plico eval` skips, such as a case saved as `name.json`. */
export async function validateEvalFiles(root: string): Promise<ValidationIssue[]> {
  const directory = getProjectRelativePaths().directories.evals;
  let names: string[];
  try {
    names = await readdir(getProjectPaths(root).directories.evals);
  } catch {
    return [];
  }
  return names
    .filter(
      (name) =>
        !name.endsWith(CASE_SUFFIX) && !name.startsWith(".") && name.toLowerCase() !== "readme.md",
    )
    .sort()
    .map((name) => ({
      path: `${directory}/${name}`,
      message: `Not run by plico eval. An eval case file must be named <name>${CASE_SUFFIX}.`,
      severity: "warning" as const,
    }));
}
